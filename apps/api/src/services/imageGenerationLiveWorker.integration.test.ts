/**
 * Database-backed OpenAI queue-to-worker activation contract tests.
 * No real OpenAI HTTP requests. Do not copy the test-only vi.mock into production.
 * Real production arming remains false; this suite simulates arming while
 * retaining the real workspace release gate, queue admission and billing checks.
 * Unmocked arming/authorization is covered by separate gate suites.
 */
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// This mock is isolated to this Vitest test file, and never changes production code.
vi.mock("./imageGenerationWorkerProviderGate.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("./imageGenerationWorkerProviderGate.js")
    >();
  return {
    ...actual,
    LIVE_PAID_WORKER_ARMED: true,
    selectWorkerImageProvider: (
      persisted: Parameters<typeof actual.selectWorkerImageProvider>[0],
      config: Parameters<typeof actual.selectWorkerImageProvider>[1],
    ) => {
      if (
        persisted.provider === "openai" &&
        persisted.model === "gpt-image-2"
      ) {
        // Live gating is tested in its own unmocked test suite.
        return { kind: "openai" as const, model: "gpt-image-2" as const };
      }
      return actual.selectWorkerImageProvider(persisted, config);
    },
  };
});

import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import MediaAsset from "../models/MediaAsset.js";
import CreditTransaction from "../models/CreditTransaction.js";
import {
  UserCreditWallet,
  ImageDailyUsage,
  ImageWorkspaceCapacity,
  ImageGenerationAdmission,
} from "../models/ImageGenerationAccounting.js";
import { parseImageGenerationConfig } from "../config/imageGenerationConfig.js";
import { enqueueImageGeneration } from "./imageGenerationQueueService.js";
import {
  discoverReservedImageJobs,
  executeReservedImageJob,
  runImageGenerationWorkerOnce,
} from "./imageGenerationWorkerService.js";
import { MockImageProvider } from "./media/providers/mockImageProvider.js";
import {
  ImageProviderError,
  type ImageProvider,
} from "./media/providers/imageProvider.js";
import type { ImageStorageBucket } from "./media/supabaseImageStorage.js";
import type { AuthenticatedUser } from "./userProfileService.js";

let mongo: MongoMemoryReplSet;
let workspaceId: string;
let profileId: mongoose.Types.ObjectId;
const authUser = { id: "live-worker-test-user" } as AuthenticatedUser;
const fixtureProvider = new MockImageProvider();
const ENV_KEYS = [
  "IMAGE_GENERATION_PROVIDER",
  "IMAGE_GENERATION_LIVE_ENABLED",
  "IMAGE_GENERATION_LIVE_WORKER_ENABLED",
  "IMAGE_GENERATION_LIVE_ROLLOUT",
  "IMAGE_GENERATION_LIVE_WORKSPACE_ALLOWLIST",
  "IMAGE_GENERATION_MODEL",
  "IMAGE_GENERATION_LIVE_CREDIT_COST",
  "IMAGE_GENERATION_LIVE_MAX_ACTIVE",
  "IMAGE_GENERATION_LIVE_DAILY_LIMIT",
  "OPENAI_API_KEY",
] as const;
const priorEnv = Object.fromEntries(
  ENV_KEYS.map((k) => [k, process.env[k]]),
) as Record<string, string | undefined>;

function configureFakeCanary() {
  Object.assign(process.env, {
    IMAGE_GENERATION_PROVIDER: "openai",
    IMAGE_GENERATION_LIVE_ENABLED: "true",
    IMAGE_GENERATION_LIVE_WORKER_ENABLED: "true",
    IMAGE_GENERATION_LIVE_ROLLOUT: "internal",
    IMAGE_GENERATION_LIVE_WORKSPACE_ALLOWLIST: workspaceId,
    IMAGE_GENERATION_MODEL: "gpt-image-2",
    IMAGE_GENERATION_LIVE_CREDIT_COST: "1",
    IMAGE_GENERATION_LIVE_MAX_ACTIVE: "1",
    IMAGE_GENERATION_LIVE_DAILY_LIMIT: "2",
    OPENAI_API_KEY: "not-a-real-api-key",
  });
}

function fakeOpenAIProvider() {
  const generate = vi.fn(
    async (request: Parameters<ImageProvider["generate"]>[0]) => {
      const image = await fixtureProvider.generate(request);
      return { ...image, provider: "openai", model: "gpt-image-2" };
    },
  );
  const provider: ImageProvider = {
    provider: "openai",
    model: "gpt-image-2",
    generate,
  };
  return { provider, generate };
}

function uncertainOpenAIProvider() {
  const generate = vi.fn(
    async (_request: Parameters<ImageProvider["generate"]>[0]) => {
      throw new ImageProviderError("Simulated lost response", "uncertain");
    },
  );
  const provider: ImageProvider = {
    provider: "openai",
    model: "gpt-image-2",
    generate,
  };
  return { provider, generate };
}

function fakeStorage() {
  const objects = new Map<string, Uint8Array>();

  const upload = vi.fn(
    async (
      key: string,
      body: ArrayBuffer,
    ): Promise<{
      error: { message: string } | null;
    }> => {
      if (objects.has(key)) {
        return {
          error: { message: "Already exists" },
        };
      }

      objects.set(key, Uint8Array.from(new Uint8Array(body)));

      return { error: null };
    },
  );

  const download = vi.fn(
    async (
      key: string,
    ): Promise<{
      data: Blob | null;
      error: { message: string } | null;
    }> => {
      const bytes = objects.get(key);

      if (!bytes) {
        return {
          data: null,
          error: { message: "Not found" },
        };
      }

      return {
        data: new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer]),
        error: null,
      };
    },
  );

  const remove = vi.fn(
    async (
      paths: string[],
    ): Promise<{
      error: { message: string } | null;
    }> => {
      for (const path of paths) {
        objects.delete(path);
      }

      return { error: null };
    },
  );

  return {
    bucket: {
      upload,
      download,
      remove,
    } satisfies ImageStorageBucket,
    objects,
    upload,
    download,
    remove,
  };
}

const liveQueueConfig = parseImageGenerationConfig({
  IMAGE_GENERATION_PROVIDER: "openai",
  IMAGE_GENERATION_LIVE_ENABLED: "true",
  IMAGE_GENERATION_MODEL: "gpt-image-2",
  IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT: "10",
  IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE: "2",
});

async function enqueueLive(key = "live-worker-request-0001") {
  const admitted = await enqueueImageGeneration({
    authUser,
    config: liveQueueConfig,
    command: {
      workspaceId,
      idempotencyKey: key,
      image: {
        prompt: "A premium product photograph with dramatic studio lighting.",
        aspectRatio: "square",
      },
    },
  });
  const asset = await MediaAsset.findById(admitted.assetId);
  if (!asset)
    throw new Error("Queue did not persist its admitted image asset.");
  return asset;
}

async function walletBalance() {
  return (await UserCreditWallet.findOne({ userId: profileId }))?.balance;
}

async function activeCount() {
  return (await ImageWorkspaceCapacity.findOne({ workspaceId }))?.active ?? 0;
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    MediaAsset.createIndexes(),
    UserCreditWallet.createIndexes(),
    ImageDailyUsage.createIndexes(),
    ImageWorkspaceCapacity.createIndexes(),
    ImageGenerationAdmission.createIndexes(),
    CreditTransaction.createIndexes(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    MediaAsset.deleteMany({}),
    UserCreditWallet.deleteMany({}),
    ImageDailyUsage.deleteMany({}),
    ImageWorkspaceCapacity.deleteMany({}),
    ImageGenerationAdmission.deleteMany({}),
    CreditTransaction.deleteMany({}),
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
    name: "Live Fake Worker Workspace",
  });
  await UserCreditWallet.create({ userId: profileId, balance: 5 });
  configureFakeCanary();
});

afterAll(async () => {
  for (const key of ENV_KEYS) {
    const previous = priorEnv[key];
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("Fake OpenAI background-worker integration", () => {
  it("admits through the actual queue, persists model and debits once", async () => {
    const first = await enqueueImageGeneration({
      authUser,
      config: liveQueueConfig,
      command: {
        workspaceId,
        idempotencyKey: "queue-contract-idempotent-0001",
        image: {
          prompt: "A premium product photograph with dramatic studio lighting.",
          aspectRatio: "square",
        },
      },
    });
    const again = await enqueueImageGeneration({
      authUser,
      config: liveQueueConfig,
      command: {
        workspaceId,
        idempotencyKey: "queue-contract-idempotent-0001",
        image: {
          prompt: "A premium product photograph with dramatic studio lighting.",
          aspectRatio: "square",
        },
      },
    });
    expect(first.created).toBe(true);
    expect(first.creditsChargedNow).toBe(1);
    expect(again.created).toBe(false);
    expect(again.creditsChargedNow).toBe(0);
    expect(again.assetId).toBe(first.assetId);
    const asset = await MediaAsset.findById(first.assetId);
    expect(asset?.generation.provider).toBe("openai");
    expect(asset?.generation.model).toBe("gpt-image-2");
    const admission = await ImageGenerationAdmission.findOne({
      assetId: first.assetId,
    });
    expect(admission?.creditsCharged).toBe(1);
    expect(await walletBalance()).toBe(4);
    expect(
      await CreditTransaction.countDocuments({
        assetId: first.assetId,
        type: "image_debit",
      }),
    ).toBe(1);
  });

  it("denies a non-allowlisted workspace before any credit mutation", async () => {
    process.env.IMAGE_GENERATION_LIVE_WORKSPACE_ALLOWLIST =
      new mongoose.Types.ObjectId().toHexString();
    await expect(
      enqueueLive("queue-nonallowlisted-0001"),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(await MediaAsset.countDocuments()).toBe(0);
    expect(await CreditTransaction.countDocuments()).toBe(0);
    expect(await walletBalance()).toBe(5);
  });

  it("denies a mismatched live credit price before admission", async () => {
    process.env.IMAGE_GENERATION_LIVE_CREDIT_COST = "2";
    await expect(
      enqueueLive("queue-price-mismatch-0001"),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(await MediaAsset.countDocuments()).toBe(0);
    expect(await CreditTransaction.countDocuments()).toBe(0);
    expect(await walletBalance()).toBe(5);
  });

  it("denies live admission when the live worker flag is off", async () => {
    process.env.IMAGE_GENERATION_LIVE_WORKER_ENABLED = "false";
    await expect(
      enqueueLive("queue-worker-disabled-0001"),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(await MediaAsset.countDocuments()).toBe(0);
    expect(await CreditTransaction.countDocuments()).toBe(0);
    expect(await walletBalance()).toBe(5);
  });

  it("denies live admission when the rollout is off", async () => {
    process.env.IMAGE_GENERATION_LIVE_ROLLOUT = "off";
    await expect(
      enqueueLive("queue-rollout-disabled-0001"),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(await MediaAsset.countDocuments()).toBe(0);
    expect(await CreditTransaction.countDocuments()).toBe(0);
    expect(await walletBalance()).toBe(5);
  });

  it("discovers an admitted OpenAI job in the allowlisted workspace", async () => {
    const asset = await enqueueLive();
    const jobs = await discoverReservedImageJobs();
    expect(jobs.map((j) => String(j._id))).toContain(String(asset._id));
    expect(await walletBalance()).toBe(4);
  });

  it("completes one fake OpenAI image and reconciles credit and capacity", async () => {
    const asset = await enqueueLive();
    const p = fakeOpenAIProvider();
    const s = fakeStorage();
    const results = await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: s.bucket,
    });

    expect(results).toContainEqual({
      outcome: "completed",
      assetId: String(asset._id),
    });
    expect(p.generate).toHaveBeenCalledTimes(1);
    expect(s.upload).toHaveBeenCalledTimes(1);
    expect(s.download).toHaveBeenCalledTimes(1);

    const completed = await MediaAsset.findById(asset._id);
    expect(completed?.status).toBe("ready");
    expect(completed?.generation.provider).toBe("openai");
    expect(completed?.generation.model).toBe("gpt-image-2");
    expect(completed?.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(completed?.storageKey).toBeTruthy();
    expect(completed?.width).toBeGreaterThan(0);
    expect(completed?.height).toBeGreaterThan(0);
    expect(await walletBalance()).toBe(4);
    expect(await activeCount()).toBe(0);
    expect(
      (await ImageGenerationAdmission.findOne({ assetId: asset._id }))?.state,
    ).toBe("released");

    const debits = await CreditTransaction.find({
      assetId: asset._id,
      type: "image_debit",
    });
    expect(debits).toHaveLength(1);
    expect(debits[0]?.amount).toBe(-1);
    expect(await CreditTransaction.countDocuments({ assetId: asset._id })).toBe(
      1,
    );
    const second = await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: s.bucket,
    });
    expect(second).toEqual([{ outcome: "idle" }]);
    expect(p.generate).toHaveBeenCalledTimes(1);
  });

  it("allows only one provider execution when two workers race", async () => {
    const asset = await enqueueLive();
    const p = fakeOpenAIProvider();
    const s = fakeStorage();
    const results = await Promise.all([
      runImageGenerationWorkerOnce({ provider: p.provider, bucket: s.bucket }),
      runImageGenerationWorkerOnce({ provider: p.provider, bucket: s.bucket }),
    ]);
    expect(
      results.flat().filter((r) => r.outcome === "completed"),
    ).toHaveLength(1);
    expect(p.generate).toHaveBeenCalledTimes(1);
    expect((await MediaAsset.findById(asset._id))?.status).toBe("ready");
    expect(await walletBalance()).toBe(4);
    expect(await activeCount()).toBe(0);
    expect(
      await CreditTransaction.countDocuments({
        assetId: asset._id,
        type: "image_debit",
      }),
    ).toBe(1);
  });

  it("never invokes provider after an uncertain outcome and preserves billing", async () => {
    const asset = await enqueueLive();
    const p = uncertainOpenAIProvider();
    const s = fakeStorage();
    const first = await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: s.bucket,
    });
    expect(first).toContainEqual({
      outcome: "recovery_required",
      assetId: String(asset._id),
    });
    expect(p.generate).toHaveBeenCalledTimes(1);
    const after = await MediaAsset.findById(asset._id);
    expect(after?.status).toBe("pending");
    expect(after?.generationExecution?.phase).toBe("provider_started");
    expect(after?.generationExecution?.providerStartedAt).toBeTruthy();
    expect(await activeCount()).toBe(1);
    expect(await walletBalance()).toBe(4);
    expect(
      await CreditTransaction.countDocuments({
        assetId: asset._id,
        type: "image_debit",
      }),
    ).toBe(1);
    expect(
      await CreditTransaction.countDocuments({
        assetId: asset._id,
        type: "refund",
      }),
    ).toBe(0);
    const remaining = await discoverReservedImageJobs();
    expect(remaining.some((j) => String(j._id) === String(asset._id))).toBe(
      false,
    );
    expect(
      await runImageGenerationWorkerOnce({
        provider: p.provider,
        bucket: s.bucket,
      }),
    ).toEqual([{ outcome: "idle" }]);
    expect(p.generate).toHaveBeenCalledTimes(1);
    expect(s.upload).not.toHaveBeenCalled();
  });

  it("ignores a reservation whose committed credit admission is missing", async () => {
    const asset = await enqueueLive();
    await ImageGenerationAdmission.deleteOne({ assetId: asset._id });
    const p = fakeOpenAIProvider();
    const result = await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: fakeStorage().bucket,
    });
    expect(result).toEqual([{ outcome: "idle" }]);
    expect(p.generate).not.toHaveBeenCalled();
  });

  it("rejects a mismatched provider without crossing provider_started", async () => {
    const asset = await enqueueLive();
    const mismatched: ImageProvider = {
      provider: "mock",
      model: "storm-mock-image-v1",
      generate: vi.fn(async () => {
        throw new Error("Must never invoke");
      }),
    };
    const jobs = await discoverReservedImageJobs();
    expect(jobs).toHaveLength(1);
    await expect(
      executeReservedImageJob(jobs[0]!, {
        provider: mismatched,
        bucket: fakeStorage().bucket,
      }),
    ).rejects.toThrow("Persisted image provider does not match the worker.");
    const persisted = await MediaAsset.findById(asset._id);
    expect(persisted?.generationExecution?.phase).toBe("reserved");
    expect(mismatched.generate).not.toHaveBeenCalled();
  });

  it("refuses to discover live jobs outside the workspace allowlist", async () => {
    const asset = await enqueueLive();
    process.env.IMAGE_GENERATION_LIVE_WORKSPACE_ALLOWLIST =
      new mongoose.Types.ObjectId().toHexString();
    expect(await discoverReservedImageJobs()).toHaveLength(0);
    expect(
      (await MediaAsset.findById(asset._id))?.generationExecution?.phase,
    ).toBe("reserved");
  });
});
