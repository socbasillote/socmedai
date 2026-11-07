import mongoose, { Schema } from "mongoose";

const walletSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      immutable: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
  },
  {
    collection: "user_credit_wallets",
    timestamps: true,
  },
);

walletSchema.index({ userId: 1 }, { unique: true });

const dailyUsageSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    dayUtc: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    collection: "image_daily_usage",
    timestamps: true,
  },
);

dailyUsageSchema.index({ workspaceId: 1, dayUtc: 1 }, { unique: true });

const capacitySchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    active: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    collection: "image_workspace_capacity",
    timestamps: true,
  },
);

capacitySchema.index({ workspaceId: 1 }, { unique: true });

const admissionSchema = new Schema(
  {
    assetId: {
      type: Schema.Types.ObjectId,
      ref: "MediaAsset",
      required: true,
      immutable: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    dayUtc: {
      type: String,
      required: true,
    },
    creditsCharged: {
      type: Number,
      required: true,
      min: 1,
    },
    state: {
      type: String,
      enum: ["active", "released"],
      default: "active",
      required: true,
    },
  },
  {
    collection: "image_generation_admissions",
    timestamps: true,
  },
);

admissionSchema.index({ assetId: 1 }, { unique: true });

admissionSchema.index({
  workspaceId: 1,
  state: 1,
});

export const UserCreditWallet =
  mongoose.models.UserCreditWallet ??
  mongoose.model("UserCreditWallet", walletSchema);

export const ImageDailyUsage =
  mongoose.models.ImageDailyUsage ??
  mongoose.model("ImageDailyUsage", dailyUsageSchema);

export const ImageWorkspaceCapacity =
  mongoose.models.ImageWorkspaceCapacity ??
  mongoose.model("ImageWorkspaceCapacity", capacitySchema);

export const ImageGenerationAdmission =
  mongoose.models.ImageGenerationAdmission ??
  mongoose.model("ImageGenerationAdmission", admissionSchema);
