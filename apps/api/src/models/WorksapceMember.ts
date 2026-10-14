import mongoose, { Schema } from "mongoose";

export const WORKSPACE_ROLES = ["admin", "editor", "viewer"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const workspaceMemberSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
    },
    role: {
      type: String,
      enum: WORKSPACE_ROLES,
      required: true,
      default: "viewer",
    },
  },
  {
    timestamps: true,
    collection: "workspacemembers",
  },
);

// A user can have only one membership per workspace.
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

workspaceMemberSchema.index({ userId: 1, workspaceId: 1 });

const WorkspaceMember =
  mongoose.models.WorkspaceMember ??
  mongoose.model("WorkspaceMember", workspaceMemberSchema);

export default WorkspaceMember;
