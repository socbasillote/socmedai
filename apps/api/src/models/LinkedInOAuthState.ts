import mongoose, { Schema } from "mongoose";

const linkedInOAuthStateSchema = new Schema(
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

const LinkedInOAuthState =
  mongoose.models.LinkedInOAuthState ??
  mongoose.model("LinkedInOAuthState", linkedInOAuthStateSchema);

export default LinkedInOAuthState;
