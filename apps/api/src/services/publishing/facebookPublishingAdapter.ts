import Post from "../../models/Post.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";

import { getFacebookPublishingCredentials } from "../facebook/facebookPublishingTokenService.js";

import { publishFacebookTextPost } from "../facebook/facebookPostService.js";

import { authorizeFacebookPublishing } from "./facebookPublishingAuthorizationService.js";

import type {
  PublishingAdapter,
  PublishingInput,
  PublishingResult,
} from "./publishingAdapter.js";

type StoredFacebookPost = {
  caption: string;
  mediaIds: unknown[];
  platforms: string[];
  platformConnections?: {
    facebook?: unknown;
  };
};

/**
 * Facebook Page publishing adapter.
 *
 * This adapter is NOT registered with the
 * production publishing workflow yet.
 *
 * It requires an explicitly supplied HTTP
 * transport to prevent accidental live posts
 * during development and testing.
 */
export class FacebookPublishingAdapter implements PublishingAdapter {
  constructor(
    private readonly authUser: AuthenticatedUser,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async publish(input: PublishingInput): Promise<PublishingResult> {
    const { postId, workspaceId, platform } = input;

    const failed = (message: string): PublishingResult => ({
      outcome: "failed",
      postId,
      platform,
      message,
    });

    const unknown = (message: string): PublishingResult => ({
      outcome: "unknown",
      postId,
      platform,
      message,
    });

    // 1. Support Facebook only.
    if (platform !== "facebook") {
      return failed("This adapter only supports Facebook publishing.");
    }

    // 2. Reject media until the shared
    // image/video pipeline is implemented.
    if (!Array.isArray(input.mediaIds) || input.mediaIds.length > 0) {
      return failed("Facebook media publishing is not supported yet.");
    }

    // 3. Require authentication and valid IDs.
    if (
      !this.authUser ||
      typeof this.authUser.id !== "string" ||
      !this.authUser.id.trim()
    ) {
      return failed("Publishing authentication failed.");
    }

    if (!isValidWorkspaceId(workspaceId) || !isValidWorkspaceId(postId)) {
      return failed("A valid post and workspace are required.");
    }

    // Re-authorize the actual publishing operation.
    //
    // This is intentionally Facebook-specific.
    // The LinkedIn authorization service must not be
    // used for Facebook-only posts.
    try {
      await authorizeFacebookPublishing({
        authUser: this.authUser,
        workspaceId,
        postId,
      });
    } catch {
      return failed("Facebook publishing authorization failed.");
    }

    // 4. Verify workspace access before
    // loading the persisted post.
    let workspace: Awaited<ReturnType<typeof getUserWorkspaceById>>;

    try {
      workspace = await getUserWorkspaceById(this.authUser, workspaceId);
    } catch {
      return failed("Publishing authorization failed.");
    }

    if (!workspace) {
      return failed("Publishing authorization failed.");
    }

    // 5. Load authoritative post data
    // from the authorized workspace.
    //
    // Do not trust the caller's caption
    // or connection selection.
    let post: StoredFacebookPost | null;

    try {
      const document = await Post.findOne({
        _id: postId,
        workspaceId: workspace._id,
      })
        .select("caption mediaIds platforms platformConnections")
        .lean();

      post = document as unknown as StoredFacebookPost | null;
    } catch {
      return failed("Unable to load the post for publishing.");
    }

    if (!post) {
      return failed("Post not found in the authorized workspace.");
    }

    // 6. Confirm Facebook is selected.
    if (
      !Array.isArray(post.platforms) ||
      !post.platforms.includes("facebook")
    ) {
      return failed("Post is not configured for Facebook.");
    }

    // 7. Require an explicitly saved
    // Facebook Page connection.
    const selectedConnection = post.platformConnections?.facebook;

    if (!selectedConnection) {
      return failed("No Facebook Page was selected for this post.");
    }

    const connectionId = String(selectedConnection);

    // If the caller supplies a Facebook connection ID,
    // it must match the connection persisted on the post.
    //
    // The persisted post remains the source of truth.
    if (!input.connectionId || input.connectionId !== connectionId) {
      return failed("The selected Facebook Page does not match this post.");
    }

    // 8. Reject persisted media until supported.
    if (!Array.isArray(post.mediaIds) || post.mediaIds.length > 0) {
      return failed("Facebook media publishing is not supported yet.");
    }

    // 9. Validate the persisted caption.
    if (typeof post.caption !== "string" || !post.caption.trim()) {
      return failed("A caption is required for Facebook publishing.");
    }

    // 10. Retrieve authorized credentials.
    let credentials: Awaited<
      ReturnType<typeof getFacebookPublishingCredentials>
    >;

    try {
      credentials = await getFacebookPublishingCredentials({
        authUser: this.authUser,
        workspaceId,
        connectionId,
      });
    } catch {
      return failed(
        "Facebook Page publishing credentials are unavailable or unauthorized.",
      );
    }

    // Defense-in-depth: never send malformed Page
    // credentials to the Facebook Graph API.
    //
    // Workspace ownership, connection status, and
    // CREATE_CONTENT permission remain the
    // responsibility of the credential service.
    if (
      !credentials ||
      typeof credentials.facebookPageId !== "string" ||
      !/^[0-9]+$/.test(credentials.facebookPageId) ||
      typeof credentials.pageAccessToken !== "string" ||
      !credentials.pageAccessToken.trim()
    ) {
      return failed(
        "Facebook Page publishing credentials are unavailable or unauthorized.",
      );
    }

    // 11. Publish using the trusted backend
    // credentials and persisted caption.
    let result: Awaited<ReturnType<typeof publishFacebookTextPost>>;

    try {
      result = await publishFacebookTextPost(
        {
          pageId: credentials.facebookPageId,
          pageAccessToken: credentials.pageAccessToken,
          message: post.caption,
        },
        this.fetchImpl,
      );
    } catch {
      // We cannot know whether an external
      // request succeeded before throwing.
      //
      // Never assume it is safe to retry.
      return unknown(
        "Facebook publishing encountered an unexpected error. " +
          "Check Facebook before retrying.",
      );
    }

    // 12. Map confirmed publication.
    if (result.outcome === "published") {
      return {
        outcome: "published",
        postId,
        platform: "facebook",
        externalPostId: result.externalPostId,
        publishedAt: new Date(),
      };
    }

    // 13. Preserve definite failure.
    if (result.outcome === "failed") {
      return failed(result.message);
    }

    // 14. Preserve uncertain outcomes.
    return unknown(result.message);
  }
}
