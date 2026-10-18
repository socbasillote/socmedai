import mongoose, { Schema } from "mongoose";

export const POST_STATUSES = [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_PLATFORMS = ["facebook", "instagram", "linkedin"] as const;

export type PostPlatform = (typeof POST_PLATFORMS)[number];

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
    title: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    caption: {
      type: String,
      required: true,
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
        validator: (platforms: string[]) => platforms.length > 0,
        message: "Select at least one publishing platform.",
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
    lastError: {
      type: String,
      maxlength: 2000,
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

postSchema.index({ workspaceId: 1, updatedAt: -1 });
postSchema.index({ workspaceId: 1, status: 1, scheduledAt: 1 });

const Post = mongoose.models.Post ?? mongoose.model("Post", postSchema);

export default Post;
