import mongoose, { Schema } from "mongoose";

const facebookOAuthSessionPageSchema = new Schema(
  {
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

    pageAccessTokenEncrypted: {
      type: String,
      required: true,
      select: false,
    },

    tasks: {
      type: [String],
      default: [],
    },
  },
  {
    _id: false,
  },
);

const facebookOAuthSessionSchema = new Schema(
  {
    sessionHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    supabaseUserId: {
      type: String,
      required: true,
      trim: true,
    },

    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    facebookUserId: {
      type: String,
      required: true,
      trim: true,
    },

    pages: {
      type: [facebookOAuthSessionPageSchema],
      default: [],
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

facebookOAuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const FacebookOAuthSession =
  mongoose.models.FacebookOAuthSession ??
  mongoose.model("FacebookOAuthSession", facebookOAuthSessionSchema);

export default FacebookOAuthSession;
