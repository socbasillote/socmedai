import mongoose, { Schema } from "mongoose";

export const CREDIT_EVENT_TYPES = [
  "opening_balance",
  "grant",
  "image_debit",
  "refund",
] as const;

export type CreditEventType = (typeof CREDIT_EVENT_TYPES)[number];

const creditTransactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      index: true,
    },

    // Stable, globally unique event reference:
    // grant:<key>
    // debit:<assetId>
    // refund:<assetId>
    // opening:<userId>
    eventKey: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
      maxlength: 160,
    },

    type: {
      type: String,
      enum: CREDIT_EVENT_TYPES,
      required: true,
      immutable: true,
    },

    amount: {
      type: Number,
      required: true,
      immutable: true,
      validate: {
        validator: (value: number) =>
          Number.isSafeInteger(value) && value !== 0,
        message: "Credit transaction amount must be a nonzero integer.",
      },
    },

    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
      validate: {
        validator: function (this: { type: CreditEventType }, value: number) {
          return (
            Number.isSafeInteger(value) &&
            (value !== 0 || this.type === "opening_balance")
          );
        },
        message: "Invalid credit transaction amount.",
      },
    },

    assetId: {
      type: Schema.Types.ObjectId,
      ref: "MediaAsset",
      immutable: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      immutable: true,
    },
  },
  {
    collection: "credit_transactions",
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
    versionKey: false,
    strict: "throw",
  },
);

creditTransactionSchema.index({ eventKey: 1 }, { unique: true });

creditTransactionSchema.index({
  userId: 1,
  createdAt: -1,
  _id: -1,
});

creditTransactionSchema.index({
  assetId: 1,
  type: 1,
});

const CreditTransaction =
  mongoose.models.CreditTransaction ??
  mongoose.model("CreditTransaction", creditTransactionSchema);

export default CreditTransaction;
