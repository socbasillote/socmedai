import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";

import {
  UserCreditWallet,
  ImageDailyUsage,
  ImageWorkspaceCapacity,
  ImageGenerationAdmission,
} from "../models/ImageGenerationAccounting.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import {
  admitImageGeneration,
  releaseImageGenerationCapacity,
  utcUsageDay,
} from "./imageGenerationAdmissionService.js";

let mongo: MongoMemoryReplSet;
let workspaceId: string;
let profileId: mongoose.Types.ObjectId;

const authUser = {
  id: "credit-integration-user",
} as AuthenticatedUser;

const otherUser = {
  id: "another-credit-user",
} as AuthenticatedUser;

const image = {
  prompt: "A beautiful product photograph with professional lighting.",
  aspectRatio: "square" as const,
};

function request(
  key = "credit-request-0001",
  policy = { dailyLimit: 3, maxActive: 2 },
) {
  return {
    authUser,
    workspaceId,
    idempotencyKey: key,
    image,
    generation: {
      provider: "mock",
      model: "storm-mock-image-v1",
    },
    policy,
  };
}

async function balance() {
  const wallet = await UserCreditWallet.findOne({
    userId: profileId,
  });

  return wallet?.balance;
}

async function activeCount() {
  const capacity = await ImageWorkspaceCapacity.findOne({
    workspaceId,
  });

  return capacity?.active ?? 0;
}

async function attemptCount() {
  const usage = await ImageDailyUsage.findOne({
    workspaceId,
    dayUtc: utcUsageDay(),
  });

  return usage?.attempts ?? 0;
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  await mongoose.connect(mongo.getUri());

  await Promise.all([
    MediaAsset.createIndexes(),
    UserCreditWallet.createIndexes(),
    ImageDailyUsage.createIndexes(),
    ImageWorkspaceCapacity.createIndexes(),
    ImageGenerationAdmission.createIndexes(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    MediaAsset.deleteMany({}),
    UserCreditWallet.deleteMany({}),
    ImageDailyUsage.deleteMany({}),
    ImageWorkspaceCapacity.deleteMany({}),
    ImageGenerationAdmission.deleteMany({}),
  ]);

  await Workspace.collection.deleteMany({});
  await UserProfile.collection.deleteMany({});

  profileId = new mongoose.Types.ObjectId();
  const workspaceObjectId = new mongoose.Types.ObjectId();

  workspaceId = String(workspaceObjectId);

  await UserProfile.collection.insertOne({
    _id: profileId,
    supabaseUserId: authUser.id,
  });

  await Workspace.collection.insertOne({
    _id: workspaceObjectId,
    ownerUserId: profileId,
    name: "Credits Test Workspace",
  });

  // Credits are seeded by trusted test setup.
  // No client-facing credit grant is involved.
  await UserCreditWallet.create({
    userId: profileId,
    balance: 5,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("Credit-aware generation admission", () => {
  it("debits one credit for a new generation", async () => {
    const result = await admitImageGeneration(request());

    expect(result.created).toBe(true);
    expect(result.creditsChargedNow).toBe(1);

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);

    expect(await ImageGenerationAdmission.countDocuments()).toBe(1);
  });

  it("does not charge for an idempotent retry", async () => {
    const first = await admitImageGeneration(request());

    const retry = await admitImageGeneration(request());

    expect(retry.created).toBe(false);
    expect(retry.creditsChargedNow).toBe(0);

    expect(String(retry.asset._id)).toBe(String(first.asset._id));

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  it("rejects changed settings under the same key", async () => {
    await admitImageGeneration(request());

    await expect(
      admitImageGeneration({
        ...request(),
        image: {
          ...image,
          prompt: "A completely different product photograph.",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(await balance()).toBe(4);
  });

  it("rejects insufficient credits without partial writes", async () => {
    await UserCreditWallet.updateOne(
      { userId: profileId },
      { $set: { balance: 0 } },
    );

    await expect(admitImageGeneration(request())).rejects.toMatchObject({
      statusCode: 402,
    });

    expect(await balance()).toBe(0);
    expect(await attemptCount()).toBe(0);
    expect(await activeCount()).toBe(0);

    expect(await MediaAsset.countDocuments()).toBe(0);
  });

  it("enforces the daily workspace limit", async () => {
    const policy = {
      dailyLimit: 1,
      maxActive: 2,
    };

    await admitImageGeneration(request("daily-request-0001", policy));

    await expect(
      admitImageGeneration(request("daily-request-0002", policy)),
    ).rejects.toMatchObject({
      statusCode: 429,
    });

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  it("enforces the active workspace limit", async () => {
    const policy = {
      dailyLimit: 3,
      maxActive: 1,
    };

    await admitImageGeneration(request("active-request-0001", policy));

    await expect(
      admitImageGeneration(request("active-request-0002", policy)),
    ).rejects.toMatchObject({
      statusCode: 429,
    });

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  it("releases an active slot once after terminal completion", async () => {
    const admitted = await admitImageGeneration(request());

    await MediaAsset.updateOne(
      { _id: admitted.asset._id },
      { $set: { status: "failed" } },
    );

    const assetId = String(admitted.asset._id);

    expect(
      await releaseImageGenerationCapacity(authUser, workspaceId, assetId),
    ).toBe(true);

    expect(
      await releaseImageGenerationCapacity(authUser, workspaceId, assetId),
    ).toBe(false);

    expect(await activeCount()).toBe(0);
    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
  });

  it("cannot release a pending generation", async () => {
    const admitted = await admitImageGeneration(request());

    await expect(
      releaseImageGenerationCapacity(
        authUser,
        workspaceId,
        String(admitted.asset._id),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(await activeCount()).toBe(1);
  });

  it("admits concurrent identical requests only once", async () => {
    const outcomes = await Promise.all([
      admitImageGeneration(request()),
      admitImageGeneration(request()),
      admitImageGeneration(request()),
    ]);

    expect(outcomes.filter((result) => result.created)).toHaveLength(1);

    expect(
      new Set(outcomes.map((result) => String(result.asset._id))).size,
    ).toBe(1);

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  it("cannot overspend credits across different requests", async () => {
    await UserCreditWallet.updateOne(
      { userId: profileId },
      { $set: { balance: 1 } },
    );

    const outcomes = await Promise.allSettled([
      admitImageGeneration(request("credit-race-request-0001")),
      admitImageGeneration(request("credit-race-request-0002")),
    ]);
    console.log(
      "Concurrent admission outcomes:",
      outcomes.map((result, index) => ({
        request: index + 1,
        status: result.status,
        error:
          result.status === "rejected"
            ? {
                name: result.reason?.name,
                message: result.reason?.message,
                code: result.reason?.code,
                errorLabels: result.reason?.errorLabels,
                stack: result.reason?.stack,
              }
            : null,
      })),
    );
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    expect(await balance()).toBe(0);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  it("rejects unauthorized workspace admission", async () => {
    await expect(
      admitImageGeneration({
        ...request(),
        authUser: otherUser,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(await balance()).toBe(5);
  });

  it("uses UTC calendar days", () => {
    expect(utcUsageDay(new Date("2026-11-07T23:59:59Z"))).toBe("2026-11-07");

    expect(utcUsageDay(new Date("2026-11-08T00:00:00Z"))).toBe("2026-11-08");
  });
});
