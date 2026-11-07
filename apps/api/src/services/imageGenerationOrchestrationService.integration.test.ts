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

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";

import {
  UserCreditWallet,
  ImageDailyUsage,
  ImageWorkspaceCapacity,
  ImageGenerationAdmission,
} from "../models/ImageGenerationAccounting.js";

import { parseImageGenerationConfig } from "../config/imageGenerationConfig.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import { submitImageGeneration } from "./imageGenerationOrchestrationService.js";

import {
  ImageProviderError,
  type ImageProvider,
} from "./media/providers/imageProvider.js";

import { MockImageProvider } from "./media/providers/mockImageProvider.js";

import { type ImageStorageBucket } from "./media/supabaseImageStorage.js";

let mongo: MongoMemoryReplSet;

let workspaceId: string;
let profileId: mongoose.Types.ObjectId;

const user = {
  id: "orchestration-test-user",
} as AuthenticatedUser;

const stranger = {
  id: "orchestration-stranger",
} as AuthenticatedUser;

const config = parseImageGenerationConfig({
  IMAGE_GENERATION_PROVIDER: "mock",
  IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT: "10",
  IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE: "2",
});

const realMock = new MockImageProvider();

function provider() {
  const generate = vi.fn(
    async (request: Parameters<ImageProvider["generate"]>[0]) =>
      realMock.generate(request),
  );

  const mockProvider: ImageProvider = {
    provider: "mock",
    model: "storm-mock-image-v1",
    generate,
  };

  return {
    provider: mockProvider,
    generate,
  };
}

function storage() {
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
          error: {
            message: "Object already exists",
          },
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

  const bucket: ImageStorageBucket = {
    upload,
    download,
    remove,
  };

  return {
    bucket,
    objects,
    upload,
    download,
    remove,
  };
}

function command(idempotencyKey = "orchestration-request-0001") {
  return {
    workspaceId,
    idempotencyKey,
    image: {
      prompt: "A premium product photograph with cinematic lighting.",
      aspectRatio: "square" as const,
    },
  };
}

function submission(
  injectedProvider: ImageProvider,
  bucket: ImageStorageBucket,
  key = "orchestration-request-0001",
) {
  return {
    authUser: user,
    command: command(key),
    config,
    provider: injectedProvider,
    bucket,
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

async function attempts() {
  const usage = await ImageDailyUsage.findOne({
    workspaceId,
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
    supabaseUserId: user.id,
  });

  await Workspace.collection.insertOne({
    _id: workspaceObjectId,
    ownerUserId: profileId,
    name: "Orchestration Test Workspace",
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

describe("Credit-aware image orchestration", () => {
  it("generates, stores, and finalizes one admitted image", async () => {
    const p = provider();
    const s = storage();

    const result = await submitImageGeneration(
      submission(p.provider, s.bucket),
    );

    expect(result.status).toBe("ready");
    expect(result.created).toBe(true);
    expect(result.creditsChargedNow).toBe(1);

    expect(result.contentSha256).toMatch(/^[a-f0-9]{64}$/);

    expect(p.generate).toHaveBeenCalledOnce();
    expect(s.upload).toHaveBeenCalledOnce();
    expect(s.download).toHaveBeenCalledOnce();

    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(0);
    expect(await attempts()).toBe(1);

    const asset = await MediaAsset.findById(result.assetId);

    expect(asset?.status).toBe("ready");
    expect(asset?.storageKey).toBeTruthy();

    const ledger = await ImageGenerationAdmission.findOne({
      assetId: result.assetId,
    });

    expect(ledger?.state).toBe("released");
  });

  it("does not charge or regenerate an identical retry", async () => {
    const p = provider();
    const s = storage();

    const first = await submitImageGeneration(submission(p.provider, s.bucket));

    const retry = await submitImageGeneration(submission(p.provider, s.bucket));

    expect(retry.assetId).toBe(first.assetId);
    expect(retry.status).toBe("ready");
    expect(retry.created).toBe(false);
    expect(retry.creditsChargedNow).toBe(0);

    expect(p.generate).toHaveBeenCalledOnce();
    expect(s.upload).toHaveBeenCalledOnce();

    expect(await balance()).toBe(4);
    expect(await attempts()).toBe(1);
  });

  it("refuses generation when credits are insufficient", async () => {
    await UserCreditWallet.updateOne(
      { userId: profileId },
      { $set: { balance: 0 } },
    );

    const p = provider();
    const s = storage();

    await expect(
      submitImageGeneration(submission(p.provider, s.bucket)),
    ).rejects.toMatchObject({
      statusCode: 402,
    });

    expect(p.generate).not.toHaveBeenCalled();
    expect(s.upload).not.toHaveBeenCalled();
    expect(await activeCount()).toBe(0);
    expect(await attempts()).toBe(0);
  });

  it("prevents unauthorized generation before charging", async () => {
    const p = provider();
    const s = storage();

    await expect(
      submitImageGeneration({
        ...submission(p.provider, s.bucket),
        authUser: stranger,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(await balance()).toBe(5);
    expect(p.generate).not.toHaveBeenCalled();
  });

  it("rejects reused keys with different image settings", async () => {
    const p = provider();
    const s = storage();

    await submitImageGeneration(submission(p.provider, s.bucket));

    await expect(
      submitImageGeneration({
        ...submission(p.provider, s.bucket),
        command: {
          ...command(),
          image: {
            prompt: "An entirely different image generation prompt.",
            aspectRatio: "square",
          },
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(p.generate).toHaveBeenCalledOnce();
    expect(await balance()).toBe(4);
  });

  it("marks a definite provider rejection failed and releases capacity", async () => {
    const p = provider();
    const s = storage();

    p.generate.mockImplementationOnce(async () => {
      throw new ImageProviderError(
        "Simulated rejected image request",
        "rejected",
      );
    });

    const result = await submitImageGeneration(
      submission(p.provider, s.bucket),
    );

    expect(result.status).toBe("failed");
    expect(result.creditsChargedNow).toBe(1);

    expect(await balance()).toBe(4);
    expect(await attempts()).toBe(1);
    expect(await activeCount()).toBe(0);

    expect(s.upload).not.toHaveBeenCalled();
    expect(p.generate).toHaveBeenCalledOnce();
  });

  it("keeps uncertain provider outcomes pending without retrying", async () => {
    const p = provider();
    const s = storage();

    p.generate.mockImplementationOnce(async () => {
      throw new ImageProviderError(
        "Simulated ambiguous network failure",
        "uncertain",
      );
    });

    await expect(
      submitImageGeneration(submission(p.provider, s.bucket)),
    ).rejects.toMatchObject({
      outcome: "uncertain",
    });

    const asset = await MediaAsset.findOne({
      workspaceId,
    });

    expect(asset?.status).toBe("pending");

    expect(asset?.generationExecution?.phase).toBe("provider_started");

    expect(await balance()).toBe(4);
    expect(await attempts()).toBe(1);
    expect(await activeCount()).toBe(1);

    // Retrying the key returns the existing
    // operation without calling the provider.
    const retry = await submitImageGeneration(submission(p.provider, s.bucket));

    expect(retry.status).toBe("pending");
    expect(retry.created).toBe(false);
    expect(retry.creditsChargedNow).toBe(0);

    expect(p.generate).toHaveBeenCalledOnce();
    expect(s.upload).not.toHaveBeenCalled();
  });

  it("retains an active slot after an uncertain upload failure", async () => {
    const p = provider();
    const s = storage();

    s.upload.mockImplementationOnce(async () => ({
      error: {
        message: "Simulated upload failure",
      },
    }));

    await expect(
      submitImageGeneration(submission(p.provider, s.bucket)),
    ).rejects.toThrow();

    const asset = await MediaAsset.findOne({
      workspaceId,
    });

    expect(asset?.status).toBe("pending");

    expect(asset?.generationExecution?.phase).toBe("storage_pending");

    expect(asset?.contentSha256).toMatch(/^[a-f0-9]{64}$/);

    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(1);

    // Do not regenerate after a failed upload.
    const retry = await submitImageGeneration(submission(p.provider, s.bucket));

    expect(retry.status).toBe("pending");
    expect(p.generate).toHaveBeenCalledOnce();
  });

  it("rejects inconsistent provider output without finalizing", async () => {
    const p = provider();
    const s = storage();

    p.generate.mockImplementationOnce(async (request) => {
      const generated = await realMock.generate(request);

      return {
        ...generated,
        model: "unexpected-model",
      };
    });

    await expect(
      submitImageGeneration(submission(p.provider, s.bucket)),
    ).rejects.toMatchObject({
      statusCode: 502,
    });

    const asset = await MediaAsset.findOne({
      workspaceId,
    });

    expect(asset?.status).toBe("pending");

    expect(asset?.generationExecution?.phase).toBe("provider_started");

    expect(await activeCount()).toBe(1);
    expect(s.upload).not.toHaveBeenCalled();
  });

  it("does not allow live OpenAI execution", async () => {
    const s = storage();

    const liveProvider: ImageProvider = {
      provider: "openai",
      model: "gpt-image-2",
      generate: vi.fn(),
    };

    const liveConfig = parseImageGenerationConfig({
      IMAGE_GENERATION_PROVIDER: "openai",
      IMAGE_GENERATION_LIVE_ENABLED: "true",
    });

    await expect(
      submitImageGeneration({
        ...submission(liveProvider, s.bucket),
        config: liveConfig,
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
    });

    expect(liveProvider.generate).not.toHaveBeenCalled();

    expect(await balance()).toBe(5);
    expect(await attempts()).toBe(0);
  });

  it("does not re-execute a separately admitted pending asset", async () => {
    const p = provider();
    const s = storage();

    // Simulate a successful admission followed
    // by a crash before a worker claimed it.
    const { admitImageGeneration } =
      await import("./imageGenerationAdmissionService.js");

    const admitted = await admitImageGeneration({
      authUser: user,
      workspaceId,
      idempotencyKey: "preclaimed-reservation-0001",
      image: {
        prompt: "A product photograph for a promotional campaign.",
        aspectRatio: "square",
      },
      generation: {
        provider: p.provider.provider,
        model: p.provider.model,
      },
      policy: {
        dailyLimit: 10,
        maxActive: 2,
      },
    });

    const retry = await submitImageGeneration({
      ...submission(p.provider, s.bucket, "preclaimed-reservation-0001"),
      command: {
        ...command("preclaimed-reservation-0001"),
        image: {
          prompt: "A product photograph for a promotional campaign.",
          aspectRatio: "square",
        },
      },
    });

    expect(admitted.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.status).toBe("pending");

    expect(p.generate).not.toHaveBeenCalled();
    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(1);
  });

  it("executes concurrent identical submissions only once", async () => {
    const p = provider();
    const s = storage();

    const results = await Promise.all([
      submitImageGeneration(
        submission(p.provider, s.bucket, "concurrent-generation-0001"),
      ),
      submitImageGeneration(
        submission(p.provider, s.bucket, "concurrent-generation-0001"),
      ),
    ]);

    expect(new Set(results.map((r) => r.assetId)).size).toBe(1);

    expect(results.filter((r) => r.created)).toHaveLength(1);

    expect(results.reduce((sum, r) => sum + r.creditsChargedNow, 0)).toBe(1);

    expect(p.generate).toHaveBeenCalledOnce();

    expect(await balance()).toBe(4);
    expect(await attempts()).toBe(1);

    // One result may have observed the asset while
    // generation was still pending. Rechecking
    // the persisted state must show completion.
    const saved = await MediaAsset.findById(results[0]!.assetId);

    expect(saved?.status).toBe("ready");
    expect(await activeCount()).toBe(0);
  });

  it("does not overspend credits across distinct concurrent submissions", async () => {
    await UserCreditWallet.updateOne(
      { userId: profileId },
      { $set: { balance: 1 } },
    );

    const p = provider();
    const s = storage();

    const outcomes = await Promise.allSettled([
      submitImageGeneration(
        submission(p.provider, s.bucket, "parallel-credit-operation-0001"),
      ),
      submitImageGeneration(
        submission(p.provider, s.bucket, "parallel-credit-operation-0002"),
      ),
    ]);

    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    expect(p.generate).toHaveBeenCalledOnce();

    expect(await balance()).toBe(0);
    expect(await attempts()).toBe(1);

    expect(
      await MediaAsset.countDocuments({
        workspaceId,
      }),
    ).toBe(1);
  });
});
