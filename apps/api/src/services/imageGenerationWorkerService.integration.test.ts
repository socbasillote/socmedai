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

import { enqueueImageGeneration } from "./imageGenerationQueueService.js";

import {
  discoverReservedImageJobs,
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

const authUser = {
  id: "worker-test-user",
} as AuthenticatedUser;

const config = parseImageGenerationConfig({
  IMAGE_GENERATION_PROVIDER: "mock",
  IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT: "10",
  IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE: "2",
});

const realProvider = new MockImageProvider();

function fakeProvider() {
  const generate = vi.fn(
    async (request: Parameters<ImageProvider["generate"]>[0]) =>
      realProvider.generate(request),
  );

  const provider: ImageProvider = {
    provider: "mock",
    model: "storm-mock-image-v1",
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

function command(idempotencyKey = "worker-job-request-0001") {
  return {
    workspaceId,
    idempotencyKey,
    image: {
      prompt: "A premium product photograph with dramatic studio lighting.",
      aspectRatio: "square" as const,
    },
  };
}

async function enqueue(key?: string) {
  return enqueueImageGeneration({
    authUser,
    config,
    command: command(key),
  });
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
    name: "Worker Integration Workspace",
  });

  await UserCreditWallet.create({
    userId: profileId,
    balance: 5,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("Background image generation worker", () => {
  it("returns idle when no admitted jobs exist", async () => {
    const result = await runImageGenerationWorkerOnce();

    expect(result).toEqual([{ outcome: "idle" }]);
  });

  it("discovers only credit-admitted reservations", async () => {
    const queued = await enqueue();

    const jobs = await discoverReservedImageJobs();

    expect(jobs.map((job) => String(job._id))).toContain(queued.assetId);

    // Simulate a missing accounting record.
    await ImageGenerationAdmission.deleteMany({});

    const after = await discoverReservedImageJobs();

    expect(after).toHaveLength(0);
  });

  it("generates a queued image and releases capacity", async () => {
    const queued = await enqueue();

    const p = fakeProvider();
    const s = fakeStorage();

    const results = await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: s.bucket,
    });

    expect(results).toContainEqual({
      outcome: "completed",
      assetId: queued.assetId,
    });

    expect(p.generate).toHaveBeenCalledOnce();
    expect(s.upload).toHaveBeenCalledOnce();
    expect(s.download).toHaveBeenCalledOnce();

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("ready");
    expect(asset?.contentSha256).toMatch(/^[a-f0-9]{64}$/);

    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(0);

    const admission = await ImageGenerationAdmission.findOne({
      assetId: queued.assetId,
    });

    expect(admission?.state).toBe("released");
  });

  it("does not regenerate an already completed job", async () => {
    await enqueue();

    const p = fakeProvider();
    const s = fakeStorage();

    await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: s.bucket,
    });

    const second = await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: s.bucket,
    });

    expect(second).toEqual([{ outcome: "idle" }]);

    expect(p.generate).toHaveBeenCalledOnce();
    expect(await balance()).toBe(4);
  });

  it("allows only one provider invocation across two workers", async () => {
    const queued = await enqueue();

    const p = fakeProvider();
    const s = fakeStorage();

    const results = await Promise.all([
      runImageGenerationWorkerOnce({
        provider: p.provider,
        bucket: s.bucket,
      }),
      runImageGenerationWorkerOnce({
        provider: p.provider,
        bucket: s.bucket,
      }),
    ]);

    const outcomes = results.flat();

    expect(
      outcomes.filter((result) => result.outcome === "completed"),
    ).toHaveLength(1);

    expect(p.generate).toHaveBeenCalledOnce();

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("ready");
    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(0);
  });

  it("marks definite provider rejection failed", async () => {
    const queued = await enqueue();

    const p = fakeProvider();
    const s = fakeStorage();

    p.generate.mockImplementationOnce(async () => {
      throw new ImageProviderError("Mock rejected the request.", "rejected");
    });

    const results = await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: s.bucket,
    });

    expect(results).toContainEqual({
      outcome: "rejected",
      assetId: queued.assetId,
    });

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("failed");
    expect(await activeCount()).toBe(0);
    expect(await balance()).toBe(4);

    expect(s.upload).not.toHaveBeenCalled();
  });

  it("does not retry an uncertain provider outcome", async () => {
    const queued = await enqueue();

    const p = fakeProvider();
    const s = fakeStorage();

    p.generate.mockImplementationOnce(async () => {
      throw new ImageProviderError("Mock network uncertainty.", "uncertain");
    });

    const first = await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: s.bucket,
    });

    expect(first).toContainEqual({
      outcome: "recovery_required",
      assetId: queued.assetId,
    });

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("pending");

    expect(asset?.generationExecution?.phase).toBe("provider_started");

    expect(await activeCount()).toBe(1);

    const second = await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: s.bucket,
    });

    expect(second).toEqual([{ outcome: "idle" }]);

    expect(p.generate).toHaveBeenCalledOnce();
  });

  it("preserves the checksum after a failed upload", async () => {
    const queued = await enqueue();

    const p = fakeProvider();
    const s = fakeStorage();

    s.upload.mockImplementationOnce(async () => ({
      error: {
        message: "Simulated upload failure",
      },
    }));

    const result = await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: s.bucket,
    });

    expect(result).toContainEqual({
      outcome: "recovery_required",
      assetId: queued.assetId,
    });

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("pending");

    expect(asset?.generationExecution?.phase).toBe("storage_pending");

    expect(asset?.contentSha256).toMatch(/^[a-f0-9]{64}$/);

    expect(await activeCount()).toBe(1);
    expect(p.generate).toHaveBeenCalledOnce();

    // The next poll must not call the provider.
    await runImageGenerationWorkerOnce({
      provider: p.provider,
      bucket: s.bucket,
    });

    expect(p.generate).toHaveBeenCalledOnce();
  });

  it("refuses to execute a live provider", async () => {
    await enqueue();

    const generate = vi.fn();

    const result = await runImageGenerationWorkerOnce({
      provider: {
        provider: "openai",
        model: "gpt-image-2",
        generate,
      },
      bucket: fakeStorage().bucket,
    });

    expect(result[0]?.outcome).toBe("recovery_required");

    expect(generate).not.toHaveBeenCalled();

    const asset = await MediaAsset.findOne({
      workspaceId,
    });

    expect(asset?.generationExecution?.phase).toBe("reserved");
  });
});
