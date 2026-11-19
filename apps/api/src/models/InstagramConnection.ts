import mongoose, { Schema } from "mongoose";
const schema = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  facebookConnectionId: { type: Schema.Types.ObjectId, ref: "FacebookConnection", required: true },
  instagramUserId: { type: String, required: true, match: /^[0-9]+$/ },
  username: { type: String, required: true },
  status: { type: String, enum: ["connected", "revoked"], default: "connected", required: true },
}, { timestamps: true });
schema.index({ workspaceId: 1, instagramUserId: 1 }, { unique: true });
export default mongoose.models.InstagramConnection ?? mongoose.model("InstagramConnection", schema);
