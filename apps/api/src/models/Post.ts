import mongoose, { Schema } from "mongoose";

export const POST_STATUSES = [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "unknown",
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_PLATFORMS = ["facebook", "instagram", "linkedin"] as const;

export type PostPlatform = (typeof POST_PLATFORMS)[number];

export const PLATFORM_PUBLISH_STATUSES = [
  "pending",
  "publishing",
  "published",
  "failed",
  "unknown",
  "simulated",
] as const;

export type PlatformPublishStatus = (typeof PLATFORM_PUBLISH_STATUSES)[number];

const postSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
    },
    clientDraftId: { type: String },
    creationRequestHash: { type: String, select: false },
    autosaveRevision: { type: Number, default: 0 },
    autosaveClosed: { type: Boolean, default: false },
    title: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    caption: {
      type: String,
      required: function (this: { status?: string; get?: (path: string) => unknown }) {
        return (this.get?.("status") ?? this.status) !== "draft";
      },
      trim: true,
      maxlength: 10000,
    },
    mediaIds: {
      type: [Schema.Types.ObjectId],
      default: () => [],
    },
    platforms: {
      type: [
        {
          type: String,
          enum: POST_PLATFORMS,
        },
      ],
      required: true,
      validate: {
        validator: function (this: { status?: string; get?: (path: string) => unknown }, platforms: string[]) {
          return (this.get?.("status") ?? this.status) === "draft" || platforms.length > 0;
        },
        message: "Select at least one publishing platform.",
      },
    },
    platformConnections: {
      instagram: { type: Schema.Types.ObjectId, ref: "InstagramConnection", default: undefined },
      linkedin: {
        type: Schema.Types.ObjectId,
        ref: "LinkedInConnection",
        default: undefined,
      },

      facebook: {
        type: Schema.Types.ObjectId,
        ref: "FacebookConnection",
      },
    },
    status: {
      type: String,
      enum: POST_STATUSES,
      required: true,
      default: "draft",
    },
    scheduledAt: {
      type: Date,
    },
    claimedAt: {
      type: Date,
    },
    attemptCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    scheduledClaimId: {
      type: String,
      default: null,
      select: false,
    },

    scheduledLeaseExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },

    lastError: {
      type: String,
      maxlength: 2000,
    },

    platformResults: {
      type: [
        {
          _id: false,
          platform: {
            type: String,
            enum: POST_PLATFORMS,
            required: true,
          },
          status: {
            type: String,
            enum: PLATFORM_PUBLISH_STATUSES,
            required: true,
            default: "pending",
          },
          externalPostId: {
            type: String,
            trim: true,
          },
          publishedAt: {
            type: Date,
          },
          lastError: {
            type: String,
            maxlength: 2000,
          },
          attemptCount: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
          },
        },
      ],
      default: () => [],
      validate: {
        validator: (results: Array<{ platform: string }>) => {
          const platforms = results.map((result) => result.platform);
          return new Set(platforms).size === platforms.length;
        },
        message: "Each platform can have only one publishing result.",
      },
    },

    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "posts",
  },
);

postSchema.index({ status: 1, scheduledAt: 1, _id: 1 });
postSchema.index({ status: 1, scheduledLeaseExpiresAt: 1 });
postSchema.index({ workspaceId: 1, updatedAt: -1 });
postSchema.index({ workspaceId: 1, status: 1, scheduledAt: 1 });

postSchema.index({ workspaceId: 1, createdByUserId: 1, clientDraftId: 1 }, {
  unique: true, partialFilterExpression: { clientDraftId: { $type: "string" } },
});

const Post = mongoose.models.Post ?? mongoose.model("Post", postSchema);

export default Post;
