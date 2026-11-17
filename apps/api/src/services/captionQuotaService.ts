import { randomUUID } from "node:crypto";
import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  _id: { type: String, required: true },
  day: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  leases: [{ _id: false, id: String, expiresAt: Date }],
});
const CaptionQuota = mongoose.models.CaptionQuota ?? mongoose.model("CaptionQuota", schema);

// All caption endpoints share this budget. Attempts remain charged on provider
// failure: an ambiguous response may still have incurred provider cost.
export const CAPTION_DAILY_LIMIT = 100;
export const CAPTION_CONCURRENCY_LIMIT = 2;

export class CaptionQuotaError extends Error {
  readonly statusCode = 429;
}

export async function withCaptionQuota<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  try {
    await CaptionQuota.updateOne({ _id: userId }, {
      $setOnInsert: { day, attempts: 0, leases: [] },
    }, { upsert: true });
  } catch (error) {
    // Another API process can win the first insert for this user.
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) throw error;
  }
  await CaptionQuota.updateOne({ _id: userId, day: { $lt: day } }, {
    $set: { day, attempts: 0 },
  });
  await CaptionQuota.updateOne({ _id: userId }, {
    $pull: { leases: { expiresAt: { $lte: now } } },
  });
  const id = randomUUID();
  const claimed = await CaptionQuota.findOneAndUpdate({
    _id: userId,
    day,
    attempts: { $lt: CAPTION_DAILY_LIMIT },
    $expr: { $lt: [{ $size: "$leases" }, CAPTION_CONCURRENCY_LIMIT] },
  }, {
    $inc: { attempts: 1 },
    // Provider requests have a 30-second deadline; crashed processes cannot
    // permanently consume a slot. Preserve leases across UTC day boundaries.
    $push: { leases: { id, expiresAt: new Date(now.getTime() + 60_000) } },
  }, { returnDocument: "after" });
  if (!claimed) throw new CaptionQuotaError("Caption generation limit reached. Please try again later.");
  try {
    return await operation();
  } finally {
    await CaptionQuota.updateOne({ _id: userId }, { $pull: { leases: { id } } });
  }
}
