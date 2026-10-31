import Post from "../../models/Post.js";

import type { AuthenticatedUser } from "../userProfileService.js";
import { PublishingOrchestrator } from "./publishingOrchestrator.js";
import { createPublishingAdapter } from "./publishingAdapterFactory.js";
import { FacebookPublishingAdapter } from "./facebookPublishingAdapter.js";

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

type ImmediatePlatform = "facebook" | "linkedin";

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

  // An atomic claim ensures that the same draft cannot be
  // claimed twice for immediate publishing.
  const post = await Post.findOneAndUpdate(
    {
      _id: postId,
      workspaceId,
      status: "draft",

      // Exactly one supported platform must be selected.
      $or: [
        {
          platforms: ["linkedin"],
          "platformConnections.linkedin": {
            $exists: true,
            $ne: null,
          },
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
          platforms: ["facebook"],
          "platformConnections.facebook": {
            $exists: true,
            $ne: null,
          },
          $or: [
            { platformResults: { $size: 0 } },
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
      ],

      // Immediate publishing remains text-only.
      mediaIds: { $size: 0 },
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
      returnDocument: "after",
      runValidators: true,
    },
  )
    .select(
      "_id workspaceId createdByUserId title caption mediaIds platforms platformConnections status scheduledAt publishedAt claimedAt attemptCount lastError platformResults createdAt updatedAt",
    )
    .lean();

  if (!post) {
    throw new ImmediatePublishingError(
      "This post is not eligible for immediate publishing. " +
        "It must be a Facebook-only or LinkedIn-only text draft " +
        "with a selected publishing connection and no previous publishing attempt.",
      409,
    );
  }

  return post;
}

export async function publishImmediatePost(input: ClaimImmediatePostInput) {
  const post = await claimImmediatePost(input);

  const platform = post.platforms[0] as ImmediatePlatform;

  const platformLabel = platform === "facebook" ? "Facebook" : "LinkedIn";

  try {
    const orchestrator = new PublishingOrchestrator(
      createPublishingAdapter(input.authUser, {
        facebook: {
          enabled: process.env.FACEBOOK_PUBLISHING_ENABLED === "true",
          adapter: new FacebookPublishingAdapter(input.authUser, fetch),
        },
      }),
    );

    return await orchestrator.processPost(post);
  } catch (error) {
    const message =
      "Publishing execution was interrupted. " +
      `The ${platformLabel} publishing outcome may be unknown. ` +
      `Check ${platformLabel} before attempting to publish again.`;

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
