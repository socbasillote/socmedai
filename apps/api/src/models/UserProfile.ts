import mongoose, { Schema } from "mongoose";

const userProfileSchema = new Schema(
  {
    supabaseUserId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "userprofiles",
  },
);

const UserProfile =
  mongoose.models.UserProfile ??
  mongoose.model("UserProfile", userProfileSchema);

export default UserProfile;
