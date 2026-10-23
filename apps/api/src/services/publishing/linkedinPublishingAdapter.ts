import Post from "../../models/Post.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import { authorizePublishing } from "./publishingAuthorizationService.js";

import { getLinkedInPublishingCredentials } from "../linkedin/linkedinPublishingTokenService.js";

import { publishLinkedInTextPost } from "../linkedin/linkedinPostService.js";

import type {
  PublishingAdapter,
  PublishingInput,
  PublishingResult,
} from "./publishingAdapter.js";

export class LinkedInPublishingAdapter implements PublishingAdapter {
  constructor(private readonly authUser: AuthenticatedUser) {}

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

    if (platform !== "linkedin") {
      return failed("This adapter only supports LinkedIn publishing.");
    }

    const connectionId = input.connectionId;

    // Fail closed before any external request.
    if (input.mediaIds.length > 0) {
      return failed("LinkedIn media publishing is not supported yet.");
    }

    try {
      await authorizePublishing({
        authUser: this.authUser,
        workspaceId,
        postId,
      });
    } catch {
      return failed("Publishing authorization failed.");
    }

    // Load the current persisted content rather than trusting caller input.
    let post: {
      caption: string;
      mediaIds: unknown[];
      platforms: string[];
      platformConnections?: {
        linkedin?: unknown;
      };
    } | null;

    try {
      post = await Post.findOne({
        _id: postId,
        workspaceId,
      })
        .select("caption mediaIds platforms platformConnections")
        .lean();
    } catch {
      return failed("Unable to load the post for publishing.");
    }

    if (!post) {
      return failed("Post not found in the authorized workspace.");
    }

    if (!post.platforms.includes("linkedin")) {
      return failed("Post is not configured for LinkedIn.");
    }

    const selectedConnection = post.platformConnections?.linkedin;

    if (!selectedConnection) {
      return failed("No LinkedIn account was selected for this post.");
    }

    if (String(selectedConnection) !== connectionId) {
      return failed("The selected LinkedIn account does not match this post.");
    }

    if (post.mediaIds.length > 0) {
      return failed("LinkedIn media publishing is not supported yet.");
    }

    if (!post.caption.trim()) {
      return failed("A caption is required for LinkedIn publishing.");
    }

    let credentials: Awaited<
      ReturnType<typeof getLinkedInPublishingCredentials>
    >;

    try {
      credentials = await getLinkedInPublishingCredentials({
        authUser: this.authUser,
        workspaceId,
        connectionId,
      });
    } catch {
      return failed(
        "LinkedIn publishing credentials are unavailable or unauthorized.",
      );
    }

    let result: Awaited<ReturnType<typeof publishLinkedInTextPost>>;

    try {
      result = await publishLinkedInTextPost({
        accessToken: credentials.accessToken,
        linkedinMemberId: credentials.linkedinMemberId,
        caption: post.caption,
      });
    } catch {
      return unknown(
        "LinkedIn publishing encountered an unexpected error. " +
          "The publication outcome is unknown. " +
          "Check LinkedIn before retrying.",
      );
    }

    if (result.outcome === "published") {
      return {
        outcome: "published",
        postId,
        platform,
        externalPostId: result.externalPostId,
        publishedAt: new Date(),
      };
    }

    if (result.outcome === "failed") {
      return failed(result.message);
    }

    return unknown(result.message);
  }
}
