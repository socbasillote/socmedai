import mongoose, { Schema } from "mongoose";

const linkedInConnectionSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    connectedByUserId: {
      type: String,
      required: true,
      trim: true,
    },
    linkedinMemberId: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    profilePictureUrl: {
      type: String,
      trim: true,
    },
    accessTokenEncrypted: {
      type: String,
      required: true,
      select: false,
    },
    refreshTokenEncrypted: {
      type: String,
      select: false,
    },
    tokenExpiresAt: {
      type: Date,
      required: true,
    },
    refreshTokenExpiresAt: {
      type: Date,
    },
    scopes: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["connected", "expired", "revoked"],
      default: "connected",
      required: true,
    },
  },
  { timestamps: true },
);

linkedInConnectionSchema.index(
  { workspaceId: 1, linkedinMemberId: 1 },
  { unique: true },
);

const LinkedInConnection =
  mongoose.models.LinkedInConnection ??
  mongoose.model("LinkedInConnection", linkedInConnectionSchema);

export default LinkedInConnection;
