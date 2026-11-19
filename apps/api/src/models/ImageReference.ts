import mongoose, { Schema } from "mongoose";
const schema = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  createdByUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  storageKey: { type: String, required: true, immutable: true },
  sha256: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  width: { type: Number, required: true }, height: { type: Number, required: true },
}, { timestamps: true, collection: "image_references" });
schema.index({ workspaceId: 1, createdByUserId: 1, _id: 1 });
export default mongoose.models.ImageReference ?? mongoose.model("ImageReference", schema);
