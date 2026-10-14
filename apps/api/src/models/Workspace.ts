import { model, models, Schema } from "mongoose";

const workspaceSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      index: true,
    },
    settings: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    collection: "workspaces",
  },
);

workspaceSchema.index({ ownerUserId: 1, updatedAt: -1 });

const Workspace = models.Workspace ?? model("Workspace", workspaceSchema);

export default Workspace;
