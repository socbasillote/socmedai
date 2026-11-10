import { describe, expect, it } from "vitest";

import mongoose from "mongoose";

import CreditTransaction from "./CreditTransaction.js";

describe("CreditTransaction schema validation", () => {
  const base = {
    userId: new mongoose.Types.ObjectId(),
    eventKey: "debit:zero-balance-test",
    type: "image_debit",
    amount: -1,
    balanceAfter: 0,
    reason: "image_generation",
    assetId: new mongoose.Types.ObjectId(),
  };

  it("accepts a debit that leaves zero credits", async () => {
    const transaction = new CreditTransaction(base);

    await expect(transaction.validate()).resolves.toBeUndefined();
  });

  it("rejects a negative resulting balance", async () => {
    const transaction = new CreditTransaction({
      ...base,
      balanceAfter: -1,
    });

    const error = transaction.validateSync();

    expect(error).toBeDefined();

    expect(error?.errors.balanceAfter).toBeDefined();

    expect(error?.errors.balanceAfter?.path).toBe("balanceAfter");
  });

  it("rejects a fractional resulting balance", async () => {
    const transaction = new CreditTransaction({
      ...base,
      balanceAfter: 0.5,
    });

    await expect(transaction.validate()).rejects.toThrow(
      "Invalid credit transaction balance",
    );
  });
});
