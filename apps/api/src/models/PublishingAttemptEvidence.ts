import mongoose, { Schema } from "mongoose";
const schema = new Schema({ postId: { type: Schema.Types.ObjectId, required: true, index: true }, claimId: String, platform: String, outcome: String, externalPostId: String, publishedAt: Date, message: String }, { timestamps: true });
export default mongoose.models.PublishingAttemptEvidence ?? mongoose.model("PublishingAttemptEvidence", schema);
