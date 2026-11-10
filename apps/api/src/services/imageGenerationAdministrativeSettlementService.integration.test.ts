import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import CreditTransaction from "../models/CreditTransaction.js";
import {
  ImageGenerationAdmission,
  ImageWorkspaceCapacity,
  UserCreditWallet,
} from "../models/ImageGenerationAccounting.js";
import { settleUncertainImageGeneration } from "./imageGenerationAdministrativeSettlementService.js";

let mongo: MongoMemoryReplSet;
let userId: mongoose.Types.ObjectId;
let workspaceId: mongoose.Types.ObjectId;
let assetId: mongoose.Types.ObjectId;
const claim = "65254908-f392-4ae6-af4c-bf078a45c2fb";

async function seed() {
  userId = new mongoose.Types.ObjectId();
  workspaceId = new mongoose.Types.ObjectId();
  assetId = new mongoose.Types.ObjectId();
  await UserProfile.collection.insertOne({
    _id: userId,
    supabaseUserId: "settlement-test-user",
  });
  await Workspace.collection.insertOne({
    _id: workspaceId,
    ownerUserId: userId,
    name: "Canary",
  });
  await MediaAsset.create({
    _id: assetId,
    workspaceId,
    createdByUserId: userId,
    type: "image",
    source: "ai-generated",
    status: "pending",
    storageProvider: "supabase",
    generation: {
      provider: "openai",
      model: "gpt-image-2",
      prompt: "A realistic commercial photograph of a matte black bottle.",
      aspectRatio: "square",
    },
    idempotencyKey: "settlement-test-request-1234",
    requestFingerprint: "a".repeat(64),
    generationExecution: {
      phase: "recovery_required",
      claimToken: claim,
      leaseExpiresAt: new Date(Date.now() - 3600_000),
      providerStartedAt: new Date(Date.now() - 7200_000),
      attemptCount: 1,
    },
  });
  await ImageGenerationAdmission.create({
    assetId,
    workspaceId,
    userId,
    dayUtc: "2026-11-10",
    creditsCharged: 1,
    state: "active",
  });
  await ImageWorkspaceCapacity.create({ workspaceId, active: 1 });
  await UserCreditWallet.create({ userId, balance: 2 });
  await CreditTransaction.create({
    userId,
    assetId,
    eventKey: `debit:${assetId}`,
    type: "image_debit",
    amount: -1,
    balanceAfter: 2,
    reason: "image_generation",
  });
}

const input = (
  decision: "retain_debit" | "compensate_one_credit" = "retain_debit",
) => ({
  assetId: String(assetId),
  workspaceId: String(workspaceId),
  expectedUserId: String(userId),
  decision,
});

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    MediaAsset.createIndexes(),
    ImageGenerationAdmission.createIndexes(),
    ImageWorkspaceCapacity.createIndexes(),
    UserCreditWallet.createIndexes(),
    CreditTransaction.createIndexes(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    MediaAsset.deleteMany({}),
    ImageGenerationAdmission.deleteMany({}),
    ImageWorkspaceCapacity.deleteMany({}),
    UserCreditWallet.deleteMany({}),
    CreditTransaction.deleteMany({}),
  ]);
  await UserProfile.collection.deleteMany({});
  await Workspace.collection.deleteMany({});
  await seed();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("Single-asset administrative settlement", () => {
  it("retains the debit, marks terminal, and releases capacity once", async () => {
    const first = await settleUncertainImageGeneration(input());
    expect(first).toMatchObject({
      outcome: "settled",
      compensationAppliedNow: 0,
      capacityReleasedNow: true,
    });
    expect((await MediaAsset.findById(assetId))?.status).toBe("failed");
    expect(
      (await MediaAsset.findById(assetId))?.generationExecution?.phase,
    ).toBe("recovery_required");
    expect((await ImageGenerationAdmission.findOne({ assetId }))?.state).toBe(
      "released",
    );
    expect(
      (await ImageWorkspaceCapacity.findOne({ workspaceId }))?.active,
    ).toBe(0);
    expect((await UserCreditWallet.findOne({ userId }))?.balance).toBe(2);
    expect(await CreditTransaction.countDocuments({ assetId })).toBe(1);
    const second = await settleUncertainImageGeneration(input());
    expect(second).toMatchObject({
      outcome: "already_settled",
      capacityReleasedNow: false,
    });
    expect(
      (await ImageWorkspaceCapacity.findOne({ workspaceId }))?.active,
    ).toBe(0);
  });

  it("compensates exactly one credit and records unique refund event", async () => {
    const first = await settleUncertainImageGeneration(
      input("compensate_one_credit"),
    );
    expect(first.compensationAppliedNow).toBe(1);
    const second = await settleUncertainImageGeneration(
      input("compensate_one_credit"),
    );
    expect(second.compensationAppliedNow).toBe(0);
    expect((await UserCreditWallet.findOne({ userId }))?.balance).toBe(3);
    const refunds = await CreditTransaction.find({ assetId, type: "refund" });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.eventKey).toBe(`refund:${assetId}`);
    expect(refunds[0]?.amount).toBe(1);
    expect(
      (await ImageWorkspaceCapacity.findOne({ workspaceId }))?.active,
    ).toBe(0);
  });

  it("rejects a conflicting second decision", async () => {
    await settleUncertainImageGeneration(input());
    await expect(
      settleUncertainImageGeneration(input("compensate_one_credit")),
    ).rejects.toThrow("different decision");
    expect((await UserCreditWallet.findOne({ userId }))?.balance).toBe(2);
  });

  it("rejects wrong ownership without modifying any balance", async () => {
    await expect(
      settleUncertainImageGeneration({
        ...input(),
        expectedUserId: String(new mongoose.Types.ObjectId()),
      }),
    ).rejects.toThrow("ownership");
    expect((await MediaAsset.findById(assetId))?.status).toBe("pending");
    expect(
      (await ImageWorkspaceCapacity.findOne({ workspaceId }))?.active,
    ).toBe(1);
  });

  it("refuses pre-provider and active-leased operations", async () => {
    await MediaAsset.updateOne(
      { _id: assetId },
      {
        $set: { "generationExecution.phase": "claimed" },
        $unset: { "generationExecution.providerStartedAt": "" },
      },
    );
    await expect(settleUncertainImageGeneration(input())).rejects.toThrow(
      "not eligible",
    );
    expect((await ImageGenerationAdmission.findOne({ assetId }))?.state).toBe(
      "active",
    );
    expect((await UserCreditWallet.findOne({ userId }))?.balance).toBe(2);
  });

  it("fails atomically if capacity is inconsistent", async () => {
    await ImageWorkspaceCapacity.updateOne(
      { workspaceId },
      { $set: { active: 0 } },
    );
    await expect(
      settleUncertainImageGeneration(input("compensate_one_credit")),
    ).rejects.toThrow("capacity");
    expect((await MediaAsset.findById(assetId))?.status).toBe("pending");
    expect((await ImageGenerationAdmission.findOne({ assetId }))?.state).toBe(
      "active",
    );
    expect((await UserCreditWallet.findOne({ userId }))?.balance).toBe(2);
    expect(await CreditTransaction.countDocuments({ type: "refund" })).toBe(0);
  });
});
