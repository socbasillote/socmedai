import mongoose from "mongoose";
import sharp from "sharp";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createHash } from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import MediaAsset from "../../models/MediaAsset.js";
import UserProfile from "../../models/UserProfile.js";
import Workspace from "../../models/Workspace.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import {
  beginImageProviderCall,
  claimImageGeneration,
  reserveImageGeneration,
} from "../mediaGenerationClaimService.js";

import {
  markMediaAssetFailed,
  markMediaAssetReady,
} from "../mediaAssetService.js";

import { completePendingMediaAsset } from "./mediaAssetStorageService.js";

import { completeClaimedImageGeneration } from "./mediaGenerationCompletionService.js";

import type { ImageStorageBucket } from "./supabaseImageStorage.js";

import {
  renewGenerationLease,
  withGenerationLeaseHeartbeat,
} from "./mediaGenerationLeaseService.js";

import { inspectStoredGeneration } from "./mediaGenerationRecoveryService.js";

import { getImageStorageKey } from "./supabaseImageStorage.js";

import { validateGeneratedImage } from "./imageValidation.js";

let mongo: MongoMemoryServer;

const userA = {
  id: "completion-user-a",
} as AuthenticatedUser;

const userB = {
  id: "completion-user-b",
} as AuthenticatedUser;

let workspaceA: string;
let workspaceB: string;

function fakeBucket() {
  const objects = new Map<string, Uint8Array>();

  const upload = vi.fn(
    async (
      key: string,
      body: ArrayBuffer,
    ): Promise<{ error: { message: string } | null }> => {
      if (objects.has(key)) {
        return {
          error: { message: "Already exists" },
        };
      }

      objects.set(key, new Uint8Array(body));
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
    async (keys: string[]): Promise<{ error: { message: string } | null }> => {
      for (const key of keys) {
        objects.delete(key);
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

async function sampleImage() {
  return sharp({
    create: {
      width: 128,
      height: 96,
      channels: 3,
      background: "#7c3aed",
    },
  })
    .png()
    .toBuffer();
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sampleLogo(color = "#ff0000") {
  return sharp({
    create: {
      width: 40,
      height: 20,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

/**
 * Install branding on a test asset that has
 * already entered provider_started.
 *
 * This fixture bypasses Mongoose immutability
 * intentionally. Production branding must only
 * be saved during image admission.
 */
async function installTestLogoSnapshot(
  assetId: string,
  logoBytes: Buffer,
  logoId = new mongoose.Types.ObjectId().toHexString(),
) {
  const storageKey = `workspaces/${workspaceA}/logos/${logoId}.png`;

  const snapshot = {
    enabled: true,
    logo: {
      storageKey,
      sha256: hashBytes(logoBytes),
    },
    position: "bottom-right",
    sizePercent: 20,
    opacity: 1,
  };

  await MediaAsset.collection.updateOne(
    {
      _id: new mongoose.Types.ObjectId(assetId),
    },
    {
      $set: {
        logoOverlaySnapshot: snapshot,
      },
    },
  );

  return snapshot;
}

async function createStartedGeneration() {
  const reservation = await reserveImageGeneration({
    authUser: userA,
    workspaceId: workspaceA,
    idempotencyKey: `generation-${new mongoose.Types.ObjectId()}`,
    image: {
      prompt: "A professional product photograph on a desk.",
      aspectRatio: "square",
    },
    generation: {
      provider: "openai",
      model: "test-image-model",
    },
  });

  const context = {
    authUser: userA,
    workspaceId: workspaceA,
    assetId: String(reservation.asset._id),
  };

  const claim = await claimImageGeneration(context);

  await beginImageProviderCall({
    ...context,
    claimToken: claim.claimToken,
  });

  return {
    ...context,
    claimToken: claim.claimToken,
  };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await MediaAsset.createIndexes();
});

beforeEach(async () => {
  await MediaAsset.deleteMany({});
  await Workspace.collection.deleteMany({});
  await UserProfile.collection.deleteMany({});

  const profileA = new mongoose.Types.ObjectId();
  const profileB = new mongoose.Types.ObjectId();

  await UserProfile.collection.insertMany([
    {
      _id: profileA,
      supabaseUserId: userA.id,
    },
    {
      _id: profileB,
      supabaseUserId: userB.id,
    },
  ]);

  const idA = new mongoose.Types.ObjectId();
  const idB = new mongoose.Types.ObjectId();

  await Workspace.collection.insertMany([
    {
      _id: idA,
      ownerUserId: profileA,
      name: "Workspace A",
    },
    {
      _id: idB,
      ownerUserId: profileB,
      name: "Workspace B",
    },
  ]);

  workspaceA = String(idA);
  workspaceB = String(idB);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("Claim-aware image completion", () => {
  it("persists verified SHA-256 and ready metadata", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    const completed = await completeClaimedImageGeneration(
      {
        ...context,
        bytes: await sampleImage(),
      },
      storage.bucket,
    );

    expect(completed.status).toBe("ready");
    expect(completed.width).toBe(128);
    expect(completed.height).toBe(96);
    expect(completed.contentSha256).toMatch(/^[a-f0-9]{64}$/);

    const saved = await MediaAsset.findById(context.assetId);

    expect(saved?.contentSha256).toBe(completed.contentSha256);

    expect(storage.upload).toHaveBeenCalledOnce();
    expect(storage.download).toHaveBeenCalledOnce();
  });

  it("rejects an incorrect claim before upload", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    await expect(
      completeClaimedImageGeneration(
        {
          ...context,
          claimToken: "wrong-token",
          bytes: await sampleImage(),
        },
        storage.bucket,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects cross-workspace completion", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    await expect(
      completeClaimedImageGeneration(
        {
          ...context,
          authUser: userB,
          workspaceId: workspaceB,
          bytes: await sampleImage(),
        },
        storage.bucket,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("allows only one concurrent storage completion", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();
    const bytes = await sampleImage();

    const results = await Promise.allSettled([
      completeClaimedImageGeneration({ ...context, bytes }, storage.bucket),
      completeClaimedImageGeneration({ ...context, bytes }, storage.bucket),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    expect(storage.upload).toHaveBeenCalledOnce();

    const saved = await MediaAsset.findById(context.assetId);

    expect(saved?.status).toBe("ready");
  });

  it("preserves storage_pending when upload fails", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    storage.upload.mockImplementationOnce(async () => ({
      error: { message: "Storage unavailable" },
    }));

    await expect(
      completeClaimedImageGeneration(
        {
          ...context,
          bytes: await sampleImage(),
        },
        storage.bucket,
      ),
    ).rejects.toThrow();

    const saved = await MediaAsset.findById(context.assetId);

    expect(saved?.status).toBe("pending");

    expect(saved?.generationExecution?.phase).toBe("storage_pending");

    expect(saved?.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects finalization after claim ownership changes", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    const originalUpload = storage.bucket.upload;

    // Simulate a claim change while the worker
    // is uploading. This is a fault-injection test.
    storage.bucket.upload = async (key, body, options) => {
      const result = await originalUpload(key, body, options);

      await MediaAsset.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(context.assetId) },
        {
          $set: {
            "generationExecution.claimToken":
              "00000000-0000-4000-8000-000000000001",
          },
        },
      );

      return result;
    };

    await expect(
      completeClaimedImageGeneration(
        {
          ...context,
          bytes: await sampleImage(),
        },
        storage.bucket,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    const saved = await MediaAsset.findById(context.assetId);

    expect(saved?.status).toBe("pending");
    expect(saved?.contentSha256).toMatch(/^[a-f0-9]{64}$/);

    // Preserve the uploaded object for reconciliation.
    expect(storage.objects.size).toBe(1);
  });

  it("blocks legacy MongoDB completion methods", async () => {
    const context = await createStartedGeneration();

    await expect(
      markMediaAssetReady(userA, workspaceA, context.assetId, {
        storageKey: `workspaces/${workspaceA}/images/test.png`,
        mimeType: "image/png",
        width: 128,
        height: 96,
        fileSize: 400_000,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    await expect(
      markMediaAssetFailed(userA, workspaceA, context.assetId),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("blocks legacy storage completion before upload", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    await expect(
      completePendingMediaAsset(
        {
          authUser: userA,
          workspaceId: workspaceA,
          assetId: context.assetId,
          bytes: await sampleImage(),
        },
        storage.bucket,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("stores the branded PNG with a matching durable checksum", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    const original = await sampleImage();
    const logo = await sampleLogo();

    const snapshot = await installTestLogoSnapshot(context.assetId, logo);

    storage.objects.set(snapshot.logo.storageKey, logo);

    let checkpointBeforeUpload: string | undefined;

    const originalUpload = storage.bucket.upload;

    storage.bucket.upload = async (key, body, options) => {
      const asset = await MediaAsset.findById(context.assetId);

      checkpointBeforeUpload = asset?.contentSha256;

      expect(asset?.generationExecution?.phase).toBe("storage_pending");

      return originalUpload(key, body, options);
    };

    const completed = await completeClaimedImageGeneration(
      {
        ...context,
        bytes: original,
      },
      storage.bucket,
    );

    expect(completed.status).toBe("ready");

    const imageKey = getImageStorageKey(workspaceA, context.assetId);

    const storedBytes = storage.objects.get(imageKey);

    expect(storedBytes).toBeDefined();

    const stored = Buffer.from(storedBytes!);

    expect(hashBytes(stored)).toBe(checkpointBeforeUpload);

    expect(completed.contentSha256).toBe(hashBytes(stored));

    // Verify that the image is actually branded.
    // The original generated image is purple;
    // the logo is red in its bottom-right corner.
    const pixel = await sharp(stored)
      .extract({
        left: 110,
        top: 85,
        width: 1,
        height: 1,
      })
      .removeAlpha()
      .raw()
      .toBuffer();

    expect([...pixel]).toEqual([255, 0, 0]);

    expect(storage.upload).toHaveBeenCalledOnce();
  });

  it("uses the admitted logo after workspace branding changes", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    const redLogo = await sampleLogo("#ff0000");
    const blueLogo = await sampleLogo("#0000ff");

    const snapshot = await installTestLogoSnapshot(context.assetId, redLogo);

    storage.objects.set(snapshot.logo.storageKey, redLogo);

    const replacementLogoId = new mongoose.Types.ObjectId().toHexString();

    const replacementKey = `workspaces/${workspaceA}/logos/${replacementLogoId}.png`;

    storage.objects.set(replacementKey, blueLogo);

    // Change the current workspace configuration.
    // The generation must still use its persisted
    // original snapshot.
    await Workspace.updateOne(
      { _id: workspaceA },
      {
        $set: {
          "settings.logoOverlay": {
            ...snapshot,
            logo: {
              storageKey: replacementKey,
              sha256: hashBytes(blueLogo),
            },
          },
        },
      },
    );

    const completed = await completeClaimedImageGeneration(
      {
        ...context,
        bytes: await sampleImage(),
      },
      storage.bucket,
    );

    expect(completed.status).toBe("ready");

    const stored = storage.objects.get(
      getImageStorageKey(workspaceA, context.assetId),
    );

    expect(stored).toBeDefined();

    const pixel = await sharp(Buffer.from(stored!))
      .extract({
        left: 110,
        top: 85,
        width: 1,
        height: 1,
      })
      .removeAlpha()
      .raw()
      .toBuffer();

    // Red is the original admitted logo.
    // Blue is the newer workspace logo.
    expect([...pixel]).toEqual([255, 0, 0]);

    const asset = await MediaAsset.findById(context.assetId);

    expect(asset?.logoOverlaySnapshot?.logo?.storageKey).toBe(
      snapshot.logo.storageKey,
    );

    expect(asset?.contentSha256).toBe(hashBytes(Buffer.from(stored!)));
  });

  it("does not store an unbranded image when its logo is missing", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    const logo = await sampleLogo();

    await installTestLogoSnapshot(context.assetId, logo);

    // The snapshot references a valid-looking
    // immutable logo version, but that object
    // does not exist in private storage.

    await expect(
      completeClaimedImageGeneration(
        {
          ...context,
          bytes: await sampleImage(),
        },
        storage.bucket,
      ),
    ).rejects.toThrow("Private workspace logo is unavailable.");

    const asset = await MediaAsset.findById(context.assetId);

    expect(asset?.status).toBe("pending");

    expect(asset?.generationExecution?.phase).toBe("provider_started");

    // No final-image checksum should have been
    // checkpointed because preparation failed.
    expect(asset?.contentSha256).toBeUndefined();

    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe("Generation crash-safety hardening", () => {
  it("persists the checksum before upload begins", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    let observedSha256: string | undefined;
    let observedPhase: string | undefined;

    const originalUpload = storage.bucket.upload;

    storage.bucket.upload = async (key, body, options) => {
      const checkpoint = await MediaAsset.findById(context.assetId);

      observedSha256 = checkpoint?.contentSha256;

      observedPhase = checkpoint?.generationExecution?.phase;

      return originalUpload(key, body, options);
    };

    const completed = await completeClaimedImageGeneration(
      {
        ...context,
        bytes: await sampleImage(),
      },
      storage.bucket,
    );

    expect(observedPhase).toBe("storage_pending");
    expect(observedSha256).toMatch(/^[a-f0-9]{64}$/);

    expect(completed.contentSha256).toBe(observedSha256);
  });

  it("retains the checksum after an upload failure", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    storage.upload.mockImplementationOnce(async () => ({
      error: {
        message: "Simulated storage failure",
      },
    }));

    await expect(
      completeClaimedImageGeneration(
        {
          ...context,
          bytes: await sampleImage(),
        },
        storage.bucket,
      ),
    ).rejects.toThrow();

    const saved = await MediaAsset.findById(context.assetId);

    expect(saved?.status).toBe("pending");
    expect(saved?.generationExecution?.phase).toBe("storage_pending");

    expect(saved?.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verifies a stored image after a simulated crash", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    const bytes = await sampleImage();

    // Simulate a crash after the durable checkpoint
    // and before normal MongoDB finalization.
    //
    // The mock records the uploaded object,
    // then throws to interrupt the workflow.
    const originalUpload = storage.bucket.upload;

    storage.bucket.upload = async (key, body, options) => {
      await originalUpload(key, body, options);

      throw new Error("Simulated process interruption");
    };

    await expect(
      completeClaimedImageGeneration(
        {
          ...context,
          bytes,
        },
        storage.bucket,
      ),
    ).rejects.toThrow();

    const beforeRecovery = await MediaAsset.findById(context.assetId);

    expect(beforeRecovery?.status).toBe("pending");

    const expectedSha = beforeRecovery?.contentSha256;

    expect(expectedSha).toMatch(/^[a-f0-9]{64}$/);

    // Simulate the original worker disappearing
    // and its lease subsequently expiring.
    await MediaAsset.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(context.assetId),
      },
      {
        $set: {
          "generationExecution.leaseExpiresAt": new Date(Date.now() - 60_000),
        },
      },
    );

    const recovery = await inspectStoredGeneration(context, storage.bucket);

    expect(recovery.outcome).toBe("checksum_verified");

    expect(recovery.objectSha256).toBe(expectedSha);

    const afterRecovery = await MediaAsset.findById(context.assetId);

    // Inspection must not automatically
    // finalize or repeat paid generation.
    expect(afterRecovery?.status).toBe("pending");
    expect(afterRecovery?.generationExecution?.phase).toBe("recovery_required");
  });

  it("rejects a lease renewal with the wrong token", async () => {
    const context = await createStartedGeneration();

    await expect(
      renewGenerationLease({
        ...context,
        claimToken: "00000000-0000-4000-8000-000000000002",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("renews an active owned lease", async () => {
    const context = await createStartedGeneration();

    const before = await MediaAsset.findById(context.assetId);

    const renewed = await renewGenerationLease(context);

    expect(renewed.generationExecution?.leaseExpiresAt).toBeInstanceOf(Date);

    expect(
      renewed.generationExecution!.leaseExpiresAt!.getTime(),
    ).toBeGreaterThanOrEqual(
      before!.generationExecution!.leaseExpiresAt!.getTime(),
    );
  });

  it("refuses to revive an expired lease", async () => {
    const context = await createStartedGeneration();

    await MediaAsset.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(context.assetId),
      },
      {
        $set: {
          "generationExecution.leaseExpiresAt": new Date(Date.now() - 60_000),
        },
      },
    );

    await expect(renewGenerationLease(context)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("refuses lease renewal after recovery takes ownership", async () => {
    const context = await createStartedGeneration();

    await MediaAsset.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(context.assetId),
      },
      {
        $set: {
          "generationExecution.phase": "recovery_required",
        },
      },
    );

    await expect(renewGenerationLease(context)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("checks ownership before and after a heartbeat operation", async () => {
    const context = await createStartedGeneration();

    let called = false;

    const value = await withGenerationLeaseHeartbeat(context, async () => {
      called = true;
      return "upload-completed";
    });

    expect(called).toBe(true);
    expect(value).toBe("upload-completed");

    const asset = await MediaAsset.findById(context.assetId);

    expect(asset?.status).toBe("pending");
    expect(asset?.generationExecution?.phase).toBe("provider_started");
  });

  it("rejects finalization when an object differs from its checkpoint", async () => {
    const context = await createStartedGeneration();
    const storage = fakeBucket();

    const originalImage = await sampleImage();

    const normalized = await validateGeneratedImage(originalImage);

    const originalUpload = storage.bucket.upload;

    storage.bucket.upload = async (key, body, options) => {
      // The normal upload adapter must verify
      // the stored bytes rather than trusting
      // the response from this mock.
      const result = await originalUpload(key, body, options);

      const differentImage = await sharp({
        create: {
          width: 128,
          height: 96,
          channels: 3,
          background: "#ef4444",
        },
      })
        .png()
        .toBuffer();

      storage.objects.set(key, differentImage);

      return result;
    };

    await expect(
      completeClaimedImageGeneration(
        {
          ...context,
          bytes: originalImage,
        },
        storage.bucket,
      ),
    ).rejects.toThrow();

    const saved = await MediaAsset.findById(context.assetId);

    expect(saved?.status).toBe("pending");
    expect(saved?.contentSha256).toBe(normalized.sha256);

    // The storage adapter attempts cleanup when
    // read-back integrity verification fails.
    expect(storage.remove).toHaveBeenCalled();

    expect(
      storage.objects.has(getImageStorageKey(workspaceA, context.assetId)),
    ).toBe(false);
  });
});
