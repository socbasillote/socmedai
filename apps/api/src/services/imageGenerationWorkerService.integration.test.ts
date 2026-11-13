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

import { createHash } from "node:crypto";
import sharp from "sharp";

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

import { getImageStorageKey } from "./media/supabaseImageStorage.js";

import { validateGeneratedImage } from "./media/imageValidation.js";

import { getImageGenerationStatus } from "./imageGenerationApiQueryService.js";

import { listWorkspaceImageHistory } from "./imageGenerationHistoryService.js";

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

async function createTestLogo() {
  return sharp({
    create: {
      width: 80,
      height: 40,
      channels: 4,
      background: "#ff0000",
    },
  })
    .png()
    .toBuffer();
}

function logoChecksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function configureWorkspaceLogo(logo: Buffer) {
  const logoId = new mongoose.Types.ObjectId().toHexString();

  const storageKey = `workspaces/${workspaceId}/logos/${logoId}.png`;

  await Workspace.updateOne(
    { _id: workspaceId },
    {
      $set: {
        "settings.logoOverlay": {
          enabled: true,
          logo: {
            storageKey,
            sha256: logoChecksum(logo),
          },
          position: "bottom-right",
          sizePercent: 20,
          opacity: 1,
        },
      },
    },
  );

  return storageKey;
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

async function enqueue(
  key: string = "worker-request-0001",
  branding: "none" | "logo" = "none",
) {
  const base = command(key);

  return enqueueImageGeneration({
    authUser,
    config,
    command: {
      ...base,
      image: {
        ...base.image,
        branding: {
          type: branding,
        },
      },
    },
  });
}

async function enqueueText(key: string, text = "BREW CO.") {
  const base = command(key);

  return enqueueImageGeneration({
    authUser,
    config,

    command: {
      ...base,

      image: {
        ...base.image,

        branding: {
          type: "text" as const,
          text,
          position: "bottom-right" as const,
          sizePercent: 20,
          opacity: 0.8,
        },
      },
    },
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

const originalImageGenerationProvider = process.env.IMAGE_GENERATION_PROVIDER;

beforeAll(() => {
  // Run this integration suite against the
  // mock provider discovery configuration.
  process.env.IMAGE_GENERATION_PROVIDER = "mock";
});

afterAll(() => {
  if (originalImageGenerationProvider === undefined) {
    delete process.env.IMAGE_GENERATION_PROVIDER;
  } else {
    process.env.IMAGE_GENERATION_PROVIDER = originalImageGenerationProvider;
  }
});

process.env.IMAGE_GENERATION_PROVIDER = "mock";
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

  it("verifies the admitted logo before generating", async () => {
    const logo = await createTestLogo();
    const logoKey = await configureWorkspaceLogo(logo);

    const queued = await enqueue("preflight-valid-logo-0001", "logo");

    const provider = fakeProvider();
    const storage = fakeStorage();

    storage.objects.set(logoKey, logo);

    const results = await runImageGenerationWorkerOnce({
      provider: provider.provider,
      bucket: storage.bucket,
    });

    expect(results).toContainEqual({
      outcome: "completed",
      assetId: queued.assetId,
    });

    expect(provider.generate).toHaveBeenCalledOnce();

    // One download for preflight, another for
    // image composition, plus final-image readback.
    expect(storage.download).toHaveBeenCalledTimes(3);

    const completed = await MediaAsset.findById(queued.assetId);

    expect(completed?.status).toBe("ready");
    expect(completed?.logoOverlaySnapshot?.enabled).toBe(true);

    expect(completed?.contentSha256).toMatch(/^[a-f0-9]{64}$/);

    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(0);
  });

  it("does not call the provider when the admitted logo is missing", async () => {
    const logo = await createTestLogo();

    await configureWorkspaceLogo(logo);

    const queued = await enqueue("preflight-missing-logo-0001", "logo");

    const provider = fakeProvider();
    const storage = fakeStorage();

    // Deliberately do not put the logo into
    // private test storage.

    const results = await runImageGenerationWorkerOnce({
      provider: provider.provider,
      bucket: storage.bucket,
    });

    expect(results).toContainEqual({
      outcome: "recovery_required",
      assetId: queued.assetId,
    });

    expect(provider.generate).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("pending");

    expect(asset?.generationExecution?.phase).toBe("claimed");

    expect(asset?.generationExecution?.providerStartedAt).toBeFalsy();

    expect(asset?.contentSha256).toBeFalsy();

    // Existing admission remains reserved.
    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(1);
  });

  it("does not call the provider when the admitted logo checksum differs", async () => {
    const originalLogo = await createTestLogo();

    const logoKey = await configureWorkspaceLogo(originalLogo);

    const queued = await enqueue("preflight-corrupt-logo-0001", "logo");

    const corruptedLogo = await sharp({
      create: {
        width: 80,
        height: 40,
        channels: 4,
        background: "#0000ff",
      },
    })
      .png()
      .toBuffer();

    const provider = fakeProvider();
    const storage = fakeStorage();

    // Same key, different bytes.
    storage.objects.set(logoKey, corruptedLogo);

    const results = await runImageGenerationWorkerOnce({
      provider: provider.provider,
      bucket: storage.bucket,
    });

    expect(results).toContainEqual({
      outcome: "recovery_required",
      assetId: queued.assetId,
    });

    expect(provider.generate).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.generationExecution?.phase).toBe("claimed");

    expect(asset?.generationExecution?.providerStartedAt).toBeFalsy();

    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(1);
  });

  it("recovers a failed logo preflight without another credit debit", async () => {
    // Create the admitted branding configuration.
    const logo = await createTestLogo();
    const logoKey = await configureWorkspaceLogo(logo);

    const queued = await enqueue("preflight-recovery-0001", "logo");

    const provider = fakeProvider();
    const storage = fakeStorage();

    // First attempt: immutable logo object is missing.
    const first = await runImageGenerationWorkerOnce({
      provider: provider.provider,
      bucket: storage.bucket,
    });

    expect(first).toContainEqual({
      outcome: "recovery_required",
      assetId: queued.assetId,
    });

    expect(provider.generate).not.toHaveBeenCalled();

    const blocked = await MediaAsset.findById(queued.assetId);

    expect(blocked?.status).toBe("pending");
    expect(blocked?.generationExecution?.phase).toBe("claimed");

    expect(blocked?.generationExecution?.providerStartedAt).toBeFalsy();

    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(1);

    // Restore the exact immutable logo bytes.
    storage.objects.set(logoKey, logo);

    // A currently owned claim must not be stolen.
    const prematureRetry = await runImageGenerationWorkerOnce({
      provider: provider.provider,
      bucket: storage.bucket,
    });

    expect(prematureRetry).toEqual([{ outcome: "idle" }]);

    expect(provider.generate).not.toHaveBeenCalled();

    // Simulate the original worker disappearing
    // and its lease subsequently expiring.
    await MediaAsset.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(queued.assetId),

        "generationExecution.phase": "claimed",
      },
      {
        $set: {
          "generationExecution.leaseExpiresAt": new Date(Date.now() - 60_000),
        },
      },
    );

    // The job can now be reclaimed safely.
    const recovered = await runImageGenerationWorkerOnce({
      provider: provider.provider,
      bucket: storage.bucket,
    });

    expect(recovered).toContainEqual({
      outcome: "completed",
      assetId: queued.assetId,
    });

    // Exactly one provider call across both attempts.
    expect(provider.generate).toHaveBeenCalledOnce();

    const completed = await MediaAsset.findById(queued.assetId);

    expect(completed?.status).toBe("ready");
    expect(completed?.contentSha256).toMatch(/^[a-f0-9]{64}$/);

    expect(completed?.logoOverlaySnapshot?.logo?.storageKey).toBe(logoKey);

    // Exactly one original credit deduction.
    expect(await balance()).toBe(4);

    // Capacity is released after completion.
    expect(await activeCount()).toBe(0);

    const admission = await ImageGenerationAdmission.findOne({
      assetId: queued.assetId,
    });

    expect(admission?.state).toBe("released");
    expect(admission?.creditsCharged).toBe(1);

    // No new provider invocation after completion.
    const finalPoll = await runImageGenerationWorkerOnce({
      provider: provider.provider,
      bucket: storage.bucket,
    });

    expect(finalPoll).toEqual([{ outcome: "idle" }]);

    expect(provider.generate).toHaveBeenCalledOnce();
  });

  it("completes a text-branded image using its admitted label snapshot", async () => {
    // 1. Admit the text-branded image.
    const queued = await enqueueText("text-worker-lifecycle-0001", "BREW CO.");

    expect(queued.created).toBe(true);
    expect(queued.creditsChargedNow).toBe(1);

    const admitted = await MediaAsset.findById(queued.assetId);

    expect(admitted?.brandingSnapshot?.type).toBe("text");

    expect(admitted?.brandingSnapshot?.text).toBe("BREW CO.");

    expect(admitted?.logoOverlaySnapshot?.enabled).toBe(false);

    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(1);

    // 2. Change workspace logo settings AFTER
    // admission.
    //
    // The worker must use the admitted text label,
    // not inherit this newly enabled logo.
    const replacementLogo = await createTestLogo();

    await configureWorkspaceLogo(replacementLogo);

    // Deliberately do not add the new logo to
    // private test storage. Text branding must
    // not attempt to download it.
    const provider = fakeProvider();
    const storage = fakeStorage();

    // 3. Run the complete generation worker.
    const result = await runImageGenerationWorkerOnce({
      provider: provider.provider,
      bucket: storage.bucket,
    });

    expect(result).toContainEqual({
      outcome: "completed",
      assetId: queued.assetId,
    });

    expect(provider.generate).toHaveBeenCalledOnce();
    expect(storage.upload).toHaveBeenCalledOnce();

    // Only the final PNG readback is required.
    // Text branding must not download a logo.
    expect(storage.download).toHaveBeenCalledOnce();

    // 4. Inspect the actual stored image.
    const imageKey = getImageStorageKey(workspaceId, queued.assetId);

    const storedBytes = storage.objects.get(imageKey);

    expect(storedBytes).toBeDefined();

    const finalImage = Buffer.from(storedBytes!);

    const metadata = await sharp(finalImage).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);

    // 5. Verify that Sharp changed the provider
    // image when applying the admitted text.
    const providerResponse = await provider.generate.mock.results[0]!.value;

    const original = await validateGeneratedImage(providerResponse.bytes);

    expect(logoChecksum(finalImage)).not.toBe(original.sha256);

    // 6. Verify durable MongoDB finalization.
    const completed = await MediaAsset.findById(queued.assetId);

    expect(completed?.status).toBe("ready");

    expect(completed?.storageKey).toBe(imageKey);

    expect(completed?.contentSha256).toBe(logoChecksum(finalImage));

    expect(completed?.brandingSnapshot?.type).toBe("text");

    expect(completed?.brandingSnapshot?.text).toBe("BREW CO.");

    expect(completed?.brandingSnapshot?.position).toBe("bottom-right");

    expect(completed?.logoOverlaySnapshot?.enabled).toBe(false);

    // 7. Verify accounting and capacity release.
    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(0);

    const admission = await ImageGenerationAdmission.findOne({
      assetId: queued.assetId,
    });

    expect(admission?.state).toBe("released");
    expect(admission?.creditsCharged).toBe(1);

    // 8. A retry with the same key and settings
    // must return the original asset.
    const retry = await enqueueText("text-worker-lifecycle-0001", "BREW CO.");

    expect(retry.created).toBe(false);
    expect(retry.creditsChargedNow).toBe(0);
    expect(retry.assetId).toBe(queued.assetId);

    expect(await balance()).toBe(4);

    // 9. Polling again must not regenerate.
    const second = await runImageGenerationWorkerOnce({
      provider: provider.provider,
      bucket: storage.bucket,
    });

    expect(second).toEqual([{ outcome: "idle" }]);

    expect(provider.generate).toHaveBeenCalledOnce();
    expect(storage.upload).toHaveBeenCalledOnce();

    // 10. Verify authenticated image status retrieval.
    const status = await getImageGenerationStatus(
      authUser,
      workspaceId,
      queued.assetId,
    );

    expect(status).toMatchObject({
      assetId: queued.assetId,
      status: "ready",
      state: "ready",
      image: {
        mimeType: "image/png",
      },
    });

    expect(status.image?.width).toBe(metadata.width);
    expect(status.image?.height).toBe(metadata.height);

    // 11. Verify authenticated image history.
    const history = await listWorkspaceImageHistory({
      authUser,
      workspaceId,
    });

    expect(history.images).toHaveLength(1);

    expect(history.images[0]).toMatchObject({
      assetId: queued.assetId,
      status: "ready",
      state: "ready",
      aspectRatio: "square",
      image: {
        mimeType: "image/png",
      },
    });

    expect(history.hasMore).toBe(false);

    // History is read-only. It must not charge credits,
    // create another asset or invoke the provider.
    expect(await balance()).toBe(4);

    expect(
      await MediaAsset.countDocuments({
        workspaceId,
      }),
    ).toBe(1);

    expect(provider.generate).toHaveBeenCalledOnce();
    expect(storage.upload).toHaveBeenCalledOnce();
  });

  it("blocks provider execution when persisted text branding is invalid", async () => {
    const queued = await enqueueText("text-worker-invalid-0001", "BREW CO.");

    expect(queued.created).toBe(true);
    expect(await balance()).toBe(4);

    // Simulate a corrupted database snapshot.
    //
    // Direct collection updates are intentionally
    // used to bypass normal Mongoose validation.
    await MediaAsset.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(queued.assetId),
      },
      {
        $set: {
          "brandingSnapshot.text": "BREW\nCO.",
        },
      },
    );

    const provider = fakeProvider();
    const storage = fakeStorage();

    const result = await runImageGenerationWorkerOnce({
      provider: provider.provider,
      bucket: storage.bucket,
    });

    expect(result).toContainEqual({
      outcome: "recovery_required",
      assetId: queued.assetId,
    });

    // The provider must never be invoked.
    expect(provider.generate).not.toHaveBeenCalled();

    // No generated image may be uploaded.
    expect(storage.upload).not.toHaveBeenCalled();

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("pending");

    // The worker acquired a claim but did not
    // cross provider_started.
    expect(asset?.generationExecution?.phase).toBe("claimed");

    expect(asset?.generationExecution?.providerStartedAt).toBeFalsy();

    expect(asset?.contentSha256).toBeFalsy();

    // The original admitted debit remains.
    // No second debit or provider execution occurs.
    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(1);
  });

  it("allows only one text-branded provider execution across competing workers", async () => {
    const queued = await enqueueText("text-worker-race-0001", "BREW CO.");

    const provider = fakeProvider();
    const storage = fakeStorage();

    const results = await Promise.all([
      runImageGenerationWorkerOnce({
        provider: provider.provider,
        bucket: storage.bucket,
      }),

      runImageGenerationWorkerOnce({
        provider: provider.provider,
        bucket: storage.bucket,
      }),
    ]);

    const completedResults = results
      .flat()
      .filter((result) => result.outcome === "completed");

    expect(completedResults).toHaveLength(1);

    expect(provider.generate).toHaveBeenCalledOnce();
    expect(storage.upload).toHaveBeenCalledOnce();

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("ready");
    expect(asset?.brandingSnapshot?.text).toBe("BREW CO.");

    const imageKey = getImageStorageKey(workspaceId, queued.assetId);

    const storedBytes = storage.objects.get(imageKey);

    expect(storedBytes).toBeDefined();

    expect(asset?.contentSha256).toBe(logoChecksum(storedBytes!));

    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(0);
  });

  it("rejects an unreadable text layout before provider_started", async () => {
    /**
     * This text is valid according to the
     * request schema but cannot fit within
     * a 5% overlay at the minimum font size.
     */
    const base = command("text-layout-preflight-invalid-0001");

    // 1. Admit a valid text-branded generation.
    const queued = await enqueueText(
      "text-layout-preflight-invalid-0001",
      "BREW CO.",
    );

    expect(queued.created).toBe(true);
    expect(queued.creditsChargedNow).toBe(1);

    // 2. Simulate corrupted persisted branding.
    //
    // Bypass Mongoose deliberately so the worker's
    // independent validation is exercised.
    await MediaAsset.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(queued.assetId),
      },
      {
        $set: {
          "brandingSnapshot.text": "A".repeat(80),
          "brandingSnapshot.sizePercent": 5,
        },
      },
    );

    const provider = fakeProvider();
    const storage = fakeStorage();

    const result = await runImageGenerationWorkerOnce({
      provider: provider.provider,
      bucket: storage.bucket,
    });

    expect(result).toContainEqual({
      outcome: "recovery_required",
      assetId: queued.assetId,
    });

    // The provider must not execute.
    expect(provider.generate).not.toHaveBeenCalled();

    expect(storage.upload).not.toHaveBeenCalled();

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("pending");

    expect(asset?.generationExecution?.phase).toBe("claimed");

    expect(asset?.generationExecution?.providerStartedAt).toBeFalsy();

    expect(asset?.contentSha256).toBeFalsy();

    // The initial admission still exists.
    // It must not be silently charged again.
    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(1);
  });
});
