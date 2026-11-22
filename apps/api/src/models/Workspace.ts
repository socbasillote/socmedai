import mongoose, { Schema } from "mongoose";

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
    archivedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    mutationVersion: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    collection: "workspaces",
  },
);

workspaceSchema.index({ ownerUserId: 1, updatedAt: -1 });

// Inactive workspaces must never be authorized through ordinary service queries.
// Settings and lifecycle endpoints explicitly opt into archived records.
workspaceSchema.pre(/^find/, function () {
  const query = this as mongoose.Query<unknown, unknown>;
  const options = query.getOptions();
  query.where({ deletedAt: null });
  if (!options.includeArchivedWorkspaces) query.where({ archivedAt: null });
});

const Workspace =
  mongoose.models.Workspace ?? mongoose.model("Workspace", workspaceSchema);

export default Workspace;
