import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import MediaAsset from "../models/MediaAsset.js";

import {
  UserCreditWallet,
  ImageDailyUsage,
  ImageWorkspaceCapacity,
  ImageGenerationAdmission,
} from "../models/ImageGenerationAccounting.js";

import { parseImageGenerationConfig } from "../config/imageGenerationConfig.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import { enqueueImageGeneration } from "./imageGenerationQueueService.js";

import { getImageGenerationCredits, getImageGenerationStatus } from "./imageGenerationApiQueryService.js";
import { listWorkspaceImageHistory } from "./imageGenerationHistoryService.js";

let mongo: MongoMemoryReplSet;

let workspaceId: string;
let userId: mongoose.Types.ObjectId;

const authUser = {
  id: "queue-test-user",
} as AuthenticatedUser;

const config = parseImageGenerationConfig({
  IMAGE_GENERATION_PROVIDER: "mock",
  IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT: "10",
  IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE: "2",
});

function command(idempotencyKey = "queue-generation-request-0001") {
  return {
    workspaceId,
    idempotencyKey,
    image: {
      prompt: "A professional product photograph with soft studio lighting.",
      aspectRatio: "square" as const,
    },
  };
}

function input(idempotencyKey?: string) {
  return {
    authUser,
    config,
    command: command(idempotencyKey),
  };
}

async function walletBalance() {
  const wallet = await UserCreditWallet.findOne({
    userId,
  });

  return wallet?.balance;
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

  userId = new mongoose.Types.ObjectId();

  const workspaceObjectId = new mongoose.Types.ObjectId();

  workspaceId = String(workspaceObjectId);

  await UserProfile.collection.insertOne({
    _id: userId,
    supabaseUserId: authUser.id,
  });

  await Workspace.collection.insertOne({
    _id: workspaceObjectId,
    ownerUserId: userId,
    name: "Queue Test Workspace",
  });

  await UserCreditWallet.create({
    userId,
    balance: 3,
  });
});

afterEach(() => vi.unstubAllEnvs());

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("Durable image queue admission", () => {
  it("saves a reserved operation without starting generation", async () => {
    const queued = await enqueueImageGeneration(input());

    expect(queued).toMatchObject({
      status: "pending",
      created: true,
      creditsChargedNow: 1,
    });

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("pending");

    expect(asset?.generationExecution?.phase).toBe("reserved");

    expect(asset?.generationExecution?.attemptCount).toBe(0);

    expect(asset?.generationExecution?.providerStartedAt).toBeUndefined();

    expect(asset?.storageKey).toBeUndefined();
    expect(asset?.contentSha256).toBeUndefined();

    expect(await walletBalance()).toBe(2);

    const admission = await ImageGenerationAdmission.findOne({
      assetId: queued.assetId,
    });

    expect(admission?.state).toBe("active");
    expect(admission?.creditsCharged).toBe(1);
  });

  it.each(["mock", "openai"] as const)("admits %s jobs past quotas when disabled, retaining counters and billing", async (provider) => {
    if (provider === "openai") {
      const liveEnvironment = {
        IMAGE_GENERATION_PROVIDER: "openai", IMAGE_GENERATION_LIVE_ENABLED: "true",
        IMAGE_GENERATION_LIVE_WORKER_ENABLED: "true", IMAGE_GENERATION_LIVE_ROLLOUT: "internal",
        IMAGE_GENERATION_MODEL: "gpt-image-2", IMAGE_GENERATION_LIMITS_ENABLED: "false",
        IMAGE_GENERATION_LIVE_WORKSPACE_ALLOWLIST: workspaceId,
        IMAGE_GENERATION_LIVE_MAX_ACTIVE: "1", IMAGE_GENERATION_LIVE_DAILY_LIMIT: "1",
        IMAGE_GENERATION_LIVE_CREDIT_COST: "1", OPENAI_API_KEY: "fake-key-no-provider-calls",
      };
      for (const [key, value] of Object.entries(liveEnvironment)) vi.stubEnv(key, value);
    }
    await UserCreditWallet.updateOne({ userId }, { $set: { balance: 5 } });
    const unlimited = parseImageGenerationConfig({
      IMAGE_GENERATION_PROVIDER: provider,
      IMAGE_GENERATION_LIVE_ENABLED: provider === "openai" ? "true" : "false",
      IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT: "1",
      IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE: "1",
    });
    for (let index = 0; index < 3; index++) {
      await enqueueImageGeneration({ ...input(`unlimited-request-${index}`), config: unlimited });
    }
    const usage = await getImageGenerationCredits(authUser, workspaceId, unlimited);
    expect(usage.usage).toMatchObject({ attempts: 3, active: 3, dailyLimit: null, maxActive: null });
    expect(await walletBalance()).toBe(2);
    await expect(enqueueImageGeneration({
      ...input("unlimited-request-denied"),
      config: { ...unlimited, IMAGE_GENERATION_LIMITS_ENABLED: true },
    })).rejects.toMatchObject({ statusCode: 429 });
    expect(await walletBalance()).toBe(2);
  });

  it("does not charge twice for an identical retry", async () => {
    const first = await enqueueImageGeneration(input());

    const retry = await enqueueImageGeneration(input());

    expect(retry.assetId).toBe(first.assetId);
    expect(retry.created).toBe(false);
    expect(retry.creditsChargedNow).toBe(0);

    expect(await walletBalance()).toBe(2);

    expect(
      await MediaAsset.countDocuments({
        workspaceId,
      }),
    ).toBe(1);
  });

  it("rejects insufficient credits without creating a job", async () => {
    await UserCreditWallet.updateOne({ userId }, { $set: { balance: 0 } });

    await expect(enqueueImageGeneration(input())).rejects.toMatchObject({
      statusCode: 402,
    });

    expect(await MediaAsset.countDocuments()).toBe(0);

    expect(await ImageGenerationAdmission.countDocuments()).toBe(0);
  });

  it("rejects unauthorized workspaces", async () => {
    await expect(
      enqueueImageGeneration({
        ...input(),
        authUser: {
          id: "unauthorized-user",
        } as AuthenticatedUser,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(await walletBalance()).toBe(3);
  });

  it("blocks disabled live provider configuration before admission", async () => {
    vi.stubEnv("IMAGE_GENERATION_LIVE_WORKER_ENABLED", "false");
    const liveConfig = parseImageGenerationConfig({
      IMAGE_GENERATION_PROVIDER: "openai",
      IMAGE_GENERATION_LIVE_ENABLED: "true",
    });

    await expect(
      enqueueImageGeneration({
        ...input(),
        config: liveConfig,
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
    });

    expect(await walletBalance()).toBe(3);

    expect(await MediaAsset.countDocuments()).toBe(0);
  });

  it("handles concurrent duplicate admission only once", async () => {
    const results = await Promise.all([
      enqueueImageGeneration(input()),
      enqueueImageGeneration(input()),
      enqueueImageGeneration(input()),
    ]);

    expect(new Set(results.map((r) => r.assetId)).size).toBe(1);

    expect(results.filter((r) => r.created)).toHaveLength(1);

    expect(results.reduce((sum, r) => sum + r.creditsChargedNow, 0)).toBe(1);

    expect(await walletBalance()).toBe(2);

    expect(await ImageGenerationAdmission.countDocuments()).toBe(1);
  });

  it("lists previously admitted images without charging credits", async () => {
    const queued = await enqueueImageGeneration(input());

    const history = await listWorkspaceImageHistory({
      authUser,
      workspaceId,
    });

    expect(history.images).toHaveLength(1);

    expect(history.images[0]).toMatchObject({
      assetId: queued.assetId,
      status: "pending",
      state: "processing",
      aspectRatio: "square",
    });

    expect(history.hasMore).toBe(false);
    expect(history.nextCursor).toBeNull();

    expect(await MediaAsset.countDocuments()).toBe(1);
  });

  it("paginates image history without duplicating records", async () => {
    const first = await enqueueImageGeneration(
      input("history-first-request-0001"),
    );

    const second = await enqueueImageGeneration(
      input("history-second-request-0002"),
    );

    const page1 = await listWorkspaceImageHistory({
      authUser,
      workspaceId,
      limit: 1,
    });

    expect(page1.images).toHaveLength(1);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listWorkspaceImageHistory({
      authUser,
      workspaceId,
      limit: 1,
      cursor: page1.nextCursor!,
    });

    expect(page2.images).toHaveLength(1);
    expect(page2.hasMore).toBe(false);

    expect(
      new Set([page1.images[0]?.assetId, page2.images[0]?.assetId]),
    ).toEqual(new Set([first.assetId, second.assetId]));
  });

  it("rejects malformed history cursors", async () => {
    await expect(
      listWorkspaceImageHistory({
        authUser,
        workspaceId,
        cursor: "invalid-cursor",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects invalid page sizes", async () => {
    await expect(
      listWorkspaceImageHistory({
        authUser,
        workspaceId,
        limit: 1000,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("does not expose another user's image history", async () => {
    await enqueueImageGeneration(input());

    await expect(
      listWorkspaceImageHistory({
        authUser: {
          id: "another-user",
        } as AuthenticatedUser,
        workspaceId,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

it("reports orphaned legacy requests consistently in status and history without charging", async () => {
  const queued = await enqueueImageGeneration(input());
  await ImageGenerationAdmission.deleteMany({ assetId: queued.assetId });
  const status = await getImageGenerationStatus(authUser, workspaceId, queued.assetId);
  expect(status.state).toBe("action_required");
  expect(status.progress.label).toBe("Request is not queued");
  const history = await listWorkspaceImageHistory({ authUser, workspaceId });
  expect(history.images[0].state).toBe("action_required");
  expect(history.images[0].message).toBe(status.message);
  expect(await walletBalance()).toBe(2);
  expect((await MediaAsset.findById(queued.assetId)).status).toBe("pending");
});
it("reports expired post-provider leases as interrupted rather than saving forever", async () => {
  const queued = await enqueueImageGeneration(input());
  await MediaAsset.updateOne({ _id: queued.assetId }, { $set: {
    "generationExecution.phase": "storage_pending", "generationExecution.leaseExpiresAt": new Date(Date.now() - 1000),
  } });
  const status = await getImageGenerationStatus(authUser, workspaceId, queued.assetId);
  expect(status.state).toBe("action_required");
  expect(status.progress.label).toBe("Generation interrupted");
  const history = await listWorkspaceImageHistory({ authUser, workspaceId });
  expect(history.images[0].state).toBe("action_required");
  expect(await walletBalance()).toBe(2);
});
