import Post from "../../models/Post.js";
import {
  PLATFORM_PUBLISH_STATUSES,
  POST_PLATFORMS,
} from "../../models/Post.js";
import type { PlatformPublishStatus, PostPlatform } from "../../models/Post.js";
import { canTransitionPlatformResult } from "./platformResultTransitions.js";

export type PlatformResultUpdate = {
  platform: PostPlatform;
  status: PlatformPublishStatus;
  externalPostId?: string;
  publishedAt?: Date;
  lastError?: string;
  attemptCount?: number;
};

export class PlatformResultServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "PlatformResultServiceError";
  }
}

export async function initializePlatformResults(
  postId: string,
  platforms: PostPlatform[],
) {
  const uniquePlatforms = [...new Set(platforms)];

  if (uniquePlatforms.length !== platforms.length) {
    throw new PlatformResultServiceError(
      "Duplicate platforms are not allowed.",
      400,
    );
  }

  if (uniquePlatforms.some((platform) => !POST_PLATFORMS.includes(platform))) {
    throw new PlatformResultServiceError(
      "Unsupported publishing platform.",
      400,
    );
  }

  const additions = uniquePlatforms.map((platform) => ({
    platform,
    status: "pending",
    attemptCount: 0,
  }));

  const post = await Post.findOneAndUpdate(
    { _id: postId },
    [
      {
        $set: {
          platformResults: {
            $reduce: {
              input: additions,
              initialValue: {
                $ifNull: ["$platformResults", []],
              },
              in: {
                $cond: [
                  {
                    $in: [
                      "$$this.platform",
                      {
                        $map: {
                          input: "$$value",
                          as: "existing",
                          in: "$$existing.platform",
                        },
                      },
                    ],
                  },
                  "$$value",
                  {
                    $concatArrays: ["$$value", ["$$this"]],
                  },
                ],
              },
            },
          },
        },
      },
    ],
    {
      returnDocument: "after",
      updatePipeline: true,
    } as never,
  );

  if (!post) {
    throw new PlatformResultServiceError("Post not found.", 404);
  }

  return post;
}

export async function updatePlatformResult(
  postId: string,
  update: PlatformResultUpdate,
) {
  if (!POST_PLATFORMS.includes(update.platform)) {
    throw new PlatformResultServiceError(
      "Unsupported publishing platform.",
      400,
    );
  }

  if (!PLATFORM_PUBLISH_STATUSES.includes(update.status)) {
    throw new PlatformResultServiceError(
      "Unsupported platform publishing status.",
      400,
    );
  }

  if (
    update.status === "published" &&
    (!update.externalPostId?.trim() ||
      !(update.publishedAt instanceof Date) ||
      Number.isNaN(update.publishedAt.getTime()))
  ) {
    throw new PlatformResultServiceError(
      "Confirmed publication requires an external post ID and a valid publication timestamp.",
      400,
    );
  }

  if (
    update.attemptCount !== undefined &&
    (!Number.isInteger(update.attemptCount) || update.attemptCount < 0)
  ) {
    throw new PlatformResultServiceError(
      "Attempt count must be a non-negative integer.",
      400,
    );
  }

  const allowedPreviousStatuses = PLATFORM_PUBLISH_STATUSES.filter(
    (currentStatus) =>
      canTransitionPlatformResult(currentStatus, update.status),
  );

  const post = await Post.findOneAndUpdate(
    {
      _id: postId,
      platformResults: {
        $elemMatch: {
          platform: update.platform,
          status: { $in: allowedPreviousStatuses },
        },
      },
    },
    {
      $set: {
        "platformResults.$[result].status": update.status,
        ...(update.externalPostId !== undefined && {
          "platformResults.$[result].externalPostId": update.externalPostId,
        }),
        ...(update.publishedAt !== undefined && {
          "platformResults.$[result].publishedAt": update.publishedAt,
        }),
        ...(update.lastError !== undefined && {
          "platformResults.$[result].lastError": update.lastError,
        }),
        ...(update.attemptCount !== undefined && {
          "platformResults.$[result].attemptCount": update.attemptCount,
        }),
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
      arrayFilters: [
        {
          "result.platform": update.platform,
          "result.status": { $in: allowedPreviousStatuses },
        },
      ],
    },
  );

  if (!post) {
    const existingPost = await Post.exists({ _id: postId });

    if (!existingPost) {
      throw new PlatformResultServiceError("Post not found.", 404);
    }

    const existingResult = await Post.exists({
      _id: postId,
      platformResults: {
        $elemMatch: { platform: update.platform },
      },
    });

    if (!existingResult) {
      throw new PlatformResultServiceError(
        "Platform result does not exist. Initialize it before updating.",
        409,
      );
    }

    throw new PlatformResultServiceError(
      "Platform result cannot transition from its current status.",
      409,
    );
  }

  return post;
}

export async function claimPlatformResult(
  postId: string,
  platform: PostPlatform,
) {
  if (!POST_PLATFORMS.includes(platform)) {
    throw new PlatformResultServiceError(
      "Unsupported publishing platform.",
      400,
    );
  }

  const post = await Post.findOneAndUpdate(
    {
      _id: postId,
      platformResults: {
        $elemMatch: {
          platform,
          status: "pending",
        },
      },
    },
    {
      $set: {
        "platformResults.$[result].status": "publishing",
        "platformResults.$[result].lastError": "",
      },
      $inc: {
        "platformResults.$[result].attemptCount": 1,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
      arrayFilters: [
        {
          "result.platform": platform,
          "result.status": "pending",
        },
      ],
    },
  );

  if (!post) {
    const existingPost = await Post.exists({ _id: postId });

    if (!existingPost) {
      throw new PlatformResultServiceError("Post not found.", 404);
    }

    // Another attempt may already have claimed or processed this platform.
    // A missing result also means there is nothing eligible to claim.
    return null;
  }

  const claimedResult = post.platformResults.find(
    (result: { platform: string; status: string; attemptCount: number }) =>
      result.platform === platform,
  );

  if (!claimedResult || claimedResult.status !== "publishing") {
    throw new PlatformResultServiceError(
      "Claimed platform result could not be verified.",
      500,
    );
  }

  return {
    post,
    attemptCount: claimedResult.attemptCount,
  };
}
