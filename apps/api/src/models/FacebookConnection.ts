import mongoose, { Schema } from "mongoose";

const facebookConnectionSchema = new Schema(
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

    facebookUserId: {
      type: String,
      required: true,
      trim: true,
    },

    facebookPageId: {
      type: String,
      required: true,
      trim: true,
    },

    pageName: {
      type: String,
      required: true,
      trim: true,
    },

    pagePictureUrl: {
      type: String,
      trim: true,
    },

    pageAccessTokenEncrypted: {
      type: String,
      required: true,
      select: false,
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
  {
    timestamps: true,
  },
);

facebookConnectionSchema.index(
  {
    workspaceId: 1,
    facebookPageId: 1,
  },
  {
    unique: true,
  },
);

const FacebookConnection =
  mongoose.models.FacebookConnection ??
  mongoose.model("FacebookConnection", facebookConnectionSchema);

export default FacebookConnection;
