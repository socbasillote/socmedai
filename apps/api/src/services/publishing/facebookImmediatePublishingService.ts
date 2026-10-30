import Post from "../../models/Post.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";

/**
 * Facebook-specific immediate publishing error.
 *
 * Kept separate from LinkedIn's ImmediatePublishingError
 * so each publishing workflow can evolve independently.
 */
export class FacebookImmediatePublishingError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookImmediatePublishingError";
  }
}

export type ClaimImmediateFacebookPostInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  postId: string;
};

/**
 * Atomically claims one eligible Facebook-only text draft.
 *
 * This function does NOT:
 * - Retrieve Facebook access tokens.
 * - Call the Facebook Graph API.
 * - Invoke a publishing adapter.
 * - Publish a post.
 *
 * A claim only changes the persisted post state
 * from "draft" to "publishing".
 */
export async function claimImmediateFacebookPost({
  authUser,
  workspaceId,
  postId,
}: ClaimImmediateFacebookPostInput) {
  // 1. Require an authenticated user.
  if (!authUser.id.trim()) {
    throw new FacebookImmediatePublishingError(
      "Authentication is required.",
      401,
    );
  }

  // 2. Reject invalid workspace or post identifiers.
  if (!isValidWorkspaceId(workspaceId) || !isValidWorkspaceId(postId)) {
    throw new FacebookImmediatePublishingError(
      "Post or workspace not found.",
      404,
    );
  }

  // 3. Verify ownership of the requested workspace.
  //
  // Reuse Storm's existing workspace authorization
  // helper instead of LinkedIn-specific publishing
  // authorization.
  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new FacebookImmediatePublishingError("Workspace not found.", 404);
  }

  const now = new Date();

  // 4. Atomically claim only eligible Facebook posts.
  //
  // Keep the platform restriction separate from
  // LinkedIn's existing immediate publishing service.
  const post = await Post.findOneAndUpdate(
    {
      _id: postId,
      workspaceId: workspace._id,

      // A previous publishing attempt must never
      // become eligible again merely because its
      // status was reset to draft.
      status: "draft",
      attemptCount: 0,

      // A persisted claim timestamp is additional
      // evidence that this post was already claimed.
      claimedAt: { $exists: false },

      platforms: ["facebook"],

      // A Facebook Page must have been selected.
      "platformConnections.facebook": {
        $exists: true,
        $ne: null,
      },

      // Text publishing only for now.
      mediaIds: {
        $size: 0,
      },

      // Prevent claiming a platform with a completed
      // or uncertain previous publishing result.
      $or: [
        {
          platformResults: {
            $size: 0,
          },
        },
        {
          platformResults: {
            $elemMatch: {
              platform: "facebook",
              status: "pending",
            },
          },
        },
      ],
    },
    {
      $set: {
        status: "publishing",
        claimedAt: now,
      },

      $inc: {
        attemptCount: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  )
    .select(
      "_id workspaceId createdByUserId title caption " +
        "mediaIds platforms platformConnections status " +
        "scheduledAt publishedAt claimedAt attemptCount " +
        "lastError platformResults createdAt updatedAt",
    )
    .lean();

  // 5. A failed atomic claim must not invoke publishing.
  if (!post) {
    throw new FacebookImmediatePublishingError(
      "This post is not eligible for immediate Facebook publishing. " +
        "It must be a Facebook-only text draft with a selected Facebook Page " +
        "and no previous publishing attempt.",
      409,
    );
  }

  return post;
}
