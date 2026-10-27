import Post from "../../models/Post.js";

import type { AuthenticatedUser } from "../userProfileService.js";
import { LinkedInPublishingAdapter } from "./linkedinPublishingAdapter.js";
import { PublishingOrchestrator } from "./publishingOrchestrator.js";

import {
  authorizePublishing,
  PublishingAuthorizationError,
} from "./publishingAuthorizationService.js";

export class ImmediatePublishingError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ImmediatePublishingError";
  }
}

type ClaimImmediatePostInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  postId: string;
};

export async function claimImmediatePost({
  authUser,
  workspaceId,
  postId,
}: ClaimImmediatePostInput) {
  try {
    await authorizePublishing({
      authUser,
      workspaceId,
      postId,
    });
  } catch (error) {
    if (error instanceof PublishingAuthorizationError) {
      throw new ImmediatePublishingError(error.message, error.statusCode);
    }

    throw error;
  }

  const now = new Date();

  const post = await Post.findOneAndUpdate(
    {
      _id: postId,
      workspaceId,
      status: "draft",
      platforms: ["linkedin"],
      "platformConnections.linkedin": { $exists: true, $ne: null },
      mediaIds: { $size: 0 },
      $or: [
        { platformResults: { $size: 0 } },
        {
          platformResults: {
            $elemMatch: {
              platform: "linkedin",
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
      "_id workspaceId createdByUserId title caption mediaIds platforms platformConnections status scheduledAt publishedAt claimedAt attemptCount lastError platformResults createdAt updatedAt",
    )
    .lean();

  if (!post) {
    throw new ImmediatePublishingError(
      "This post is not eligible for immediate LinkedIn publishing. " +
        "It must be a LinkedIn-only text draft with a selected LinkedIn account " +
        "and no previous publishing attempt.",
      409,
    );
  }

  return post;
}

export async function publishImmediatePost(input: ClaimImmediatePostInput) {
  const post = await claimImmediatePost(input);

  try {
    const adapter = new LinkedInPublishingAdapter(input.authUser);

    const orchestrator = new PublishingOrchestrator(adapter);

    return await orchestrator.processPost(post);
  } catch (error) {
    const message =
      "Publishing execution was interrupted. " +
      "The LinkedIn publishing outcome may be unknown. " +
      "Check LinkedIn before attempting to publish again.";

    try {
      await Post.updateOne(
        {
          _id: post._id,
          workspaceId: post.workspaceId,
          status: "publishing",
        },
        {
          $set: {
            lastError: message,
          },
        },
      );
    } catch (persistenceError) {
      console.error(
        "[immediate-publishing] Failed to record interrupted publishing:",
        persistenceError,
      );
    }

    console.error("[immediate-publishing] Publishing execution failed:", error);

    throw new ImmediatePublishingError(message, 500);
  }
}
