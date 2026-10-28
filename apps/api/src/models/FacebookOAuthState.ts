import mongoose, { Schema } from "mongoose";

const facebookOAuthStateSchema = new Schema(
  {
    stateHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    supabaseUserId: {
      type: String,
      required: true,
      index: true,
    },

    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  },
);

const FacebookOAuthState =
  mongoose.models.FacebookOAuthState ??
  mongoose.model("FacebookOAuthState", facebookOAuthStateSchema);

export default FacebookOAuthState;
