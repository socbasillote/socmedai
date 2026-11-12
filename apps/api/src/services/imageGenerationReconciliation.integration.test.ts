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

import { runImageGenerationRecoverySweep } from "./imageGenerationRecoverySweepService.js";

import {
  UserCreditWallet,
  ImageDailyUsage,
  ImageWorkspaceCapacity,
  ImageGenerationAdmission,
} from "../models/ImageGenerationAccounting.js";

import { parseImageGenerationConfig } from "../config/imageGenerationConfig.js";

import { enqueueImageGeneration } from "./imageGenerationQueueService.js";

import { runImageGenerationWorkerOnce } from "./imageGenerationWorkerService.js";

import {
  claimImageGeneration,
  beginImageProviderCall,
} from "./mediaGenerationClaimService.js";

import { reconcileVerifiedImageGeneration } from "./media/mediaGenerationReconciliationService.js";

import {
  discoverTerminalAdmissions,
  reconcileTerminalImageCapacity,
} from "./imageGenerationCapacityReconciliationService.js";

import {
  getImageStorageKey,
  type ImageStorageBucket,
} from "./media/supabaseImageStorage.js";

import { MockImageProvider } from "./media/providers/mockImageProvider.js";

import type { AuthenticatedUser } from "./userProfileService.js";
const originalImageGenerationProvider = process.env.IMAGE_GENERATION_PROVIDER;
let mongo: MongoMemoryReplSet;

let workspaceId: string;
let profileId: mongoose.Types.ObjectId;

const user = {
  id: "reconciliation-test-user",
} as AuthenticatedUser;

const config = parseImageGenerationConfig({
  IMAGE_GENERATION_PROVIDER: "mock",
  IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT: "10",
  IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE: "2",
});

const provider = new MockImageProvider();

function storage() {
  const objects = new Map<string, Uint8Array>();

  const upload = vi.fn(
    async (
      path: string,
      body: ArrayBuffer,
    ): Promise<{
      error: { message: string } | null;
    }> => {
      if (objects.has(path)) {
        return {
          error: { message: "Already exists" },
        };
      }

      objects.set(path, Uint8Array.from(new Uint8Array(body)));

      return { error: null };
    },
  );

  const download = vi.fn(
    async (
      path: string,
    ): Promise<{
      data: Blob | null;
      error: { message: string } | null;
    }> => {
      const bytes = objects.get(path);

      if (!bytes) {
        return {
          data: null,
          error: { message: "Missing object" },
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

let sequence = 0;

async function enqueue() {
  sequence++;

  return enqueueImageGeneration({
    authUser: user,
    config,
    command: {
      workspaceId,
      idempotencyKey: `recovery-request-${String(sequence).padStart(8, "0")}`,
      image: {
        prompt: "A cinematic professional product photograph.",
        aspectRatio: "square",
      },
    },
  });
}

async function expireLease(assetId: string) {
  await MediaAsset.collection.updateOne(
    {
      _id: new mongoose.Types.ObjectId(assetId),
    },
    {
      $set: {
        "generationExecution.leaseExpiresAt": new Date(Date.now() - 60_000),
      },
    },
  );
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

function context(assetId: string) {
  return {
    authUser: user,
    workspaceId,
    assetId,
  };
}

/**
 * Simulate a crash after the image has been
 * written, but before MongoDB finalization.
 */
async function createInterruptedUpload() {
  const queued = await enqueue();
  const s = storage();

  s.upload.mockImplementationOnce(async (path: string, bytes: ArrayBuffer) => {
    // Simulate an upload that successfully
    // writes the object to storage.
    s.objects.set(path, Uint8Array.from(new Uint8Array(bytes)));

    // But the client never receives confirmation.
    // This represents an ambiguous upload result.
    throw new Error("Simulated lost upload response");
  });

  const result = await runImageGenerationWorkerOnce({
    provider,
    bucket: s.bucket,
  });

  expect(result).toContainEqual({
    outcome: "recovery_required",
    assetId: queued.assetId,
  });

  const before = await MediaAsset.findById(queued.assetId);

  expect(before?.status).toBe("pending");

  expect(before?.generationExecution?.phase).toBe("storage_pending");

  expect(before?.contentSha256).toMatch(/^[a-f0-9]{64}$/);

  await expireLease(queued.assetId);

  return {
    queued,
    storage: s,
  };
}

beforeAll(async () => {
  process.env.IMAGE_GENERATION_PROVIDER = "mock";
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
  sequence = 0;

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
    name: "Recovery Test Workspace",
  });

  await UserCreditWallet.create({
    userId: profileId,
    balance: 5,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (originalImageGenerationProvider === undefined) {
    delete process.env.IMAGE_GENERATION_PROVIDER;
  } else {
    process.env.IMAGE_GENERATION_PROVIDER = originalImageGenerationProvider;
  }
});

describe("Generation crash reconciliation", () => {
  it("reclaims an expired pre-provider claim", async () => {
    const queued = await enqueue();

    const firstClaim = await claimImageGeneration(context(queued.assetId));

    expect(firstClaim.claimToken).toBeTruthy();

    await expireLease(queued.assetId);

    const s = storage();

    const results = await runImageGenerationWorkerOnce({
      provider,
      bucket: s.bucket,
    });

    expect(results).toContainEqual({
      assetId: queued.assetId,
      outcome: "completed",
    });

    const final = await MediaAsset.findById(queued.assetId);

    expect(final?.status).toBe("ready");

    expect(final?.generationExecution?.attemptCount).toBe(2);

    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(0);
  });

  it("never rediscovers expired provider_started jobs", async () => {
    const queued = await enqueue();

    const claimed = await claimImageGeneration(context(queued.assetId));

    await beginImageProviderCall({
      ...context(queued.assetId),
      claimToken: claimed.claimToken,
    });

    await expireLease(queued.assetId);

    const s = storage();

    const results = await runImageGenerationWorkerOnce({
      provider,
      bucket: s.bucket,
    });

    expect(results).toEqual([{ outcome: "idle" }]);

    const final = await MediaAsset.findById(queued.assetId);

    expect(final?.status).toBe("pending");

    expect(final?.generationExecution?.phase).toBe("provider_started");

    expect(await activeCount()).toBe(1);
  });

  it("recovers uploaded bytes using the durable SHA-256", async () => {
    const interrupted = await createInterruptedUpload();

    const reconciled = await reconcileVerifiedImageGeneration(
      context(interrupted.queued.assetId),
      interrupted.storage.bucket,
    );

    expect(reconciled.outcome).toBe("verified_ready");

    const asset = await MediaAsset.findById(interrupted.queued.assetId);

    expect(asset?.status).toBe("ready");

    expect(asset?.storageKey).toBe(
      getImageStorageKey(workspaceId, interrupted.queued.assetId),
    );

    expect(await balance()).toBe(4);

    // Image finalization and capacity repair
    // are separate idempotent steps.
    expect(await activeCount()).toBe(1);
  });

  it("does not finalize an image with corrupted stored bytes", async () => {
    const interrupted = await createInterruptedUpload();

    const key = getImageStorageKey(workspaceId, interrupted.queued.assetId);

    interrupted.storage.objects.set(key, Buffer.from("corrupted image"));

    const reconciled = await reconcileVerifiedImageGeneration(
      context(interrupted.queued.assetId),
      interrupted.storage.bucket,
    );

    expect(reconciled.outcome).toBe("manual_review_required");

    const asset = await MediaAsset.findById(interrupted.queued.assetId);

    expect(asset?.status).toBe("pending");

    expect(await activeCount()).toBe(1);
  });

  it("cannot finalize a missing stored image", async () => {
    const interrupted = await createInterruptedUpload();

    interrupted.storage.objects.clear();

    const reconciled = await reconcileVerifiedImageGeneration(
      context(interrupted.queued.assetId),
      interrupted.storage.bucket,
    );

    expect(reconciled.outcome).toBe("manual_review_required");

    const asset = await MediaAsset.findById(interrupted.queued.assetId);

    expect(asset?.status).toBe("pending");
    expect(await balance()).toBe(4);
  });

  it("allows only one concurrent checksum recovery finalization", async () => {
    const interrupted = await createInterruptedUpload();

    const results = await Promise.all([
      reconcileVerifiedImageGeneration(
        context(interrupted.queued.assetId),
        interrupted.storage.bucket,
      ),
      reconcileVerifiedImageGeneration(
        context(interrupted.queued.assetId),
        interrupted.storage.bucket,
      ),
    ]);

    expect(results.some((r) => r.outcome === "verified_ready")).toBe(true);

    const asset = await MediaAsset.findById(interrupted.queued.assetId);

    expect(asset?.status).toBe("ready");

    expect(
      await MediaAsset.countDocuments({
        _id: interrupted.queued.assetId,
        status: "ready",
      }),
    ).toBe(1);

    expect(await balance()).toBe(4);
  });

  it("repairs capacity after terminal persistence", async () => {
    const interrupted = await createInterruptedUpload();

    await reconcileVerifiedImageGeneration(
      context(interrupted.queued.assetId),
      interrupted.storage.bucket,
    );

    const candidates = await discoverTerminalAdmissions();

    expect(candidates.map((c) => String(c.assetId))).toContain(
      interrupted.queued.assetId,
    );

    const repaired = await reconcileTerminalImageCapacity();

    expect(repaired).toContainEqual({
      assetId: interrupted.queued.assetId,
      outcome: "released",
    });

    expect(await activeCount()).toBe(0);
    expect(await balance()).toBe(4);

    const admission = await ImageGenerationAdmission.findOne({
      assetId: interrupted.queued.assetId,
    });

    expect(admission?.state).toBe("released");
  });

  it("does not release terminal capacity twice", async () => {
    const queued = await enqueue();

    await MediaAsset.updateOne(
      { _id: queued.assetId },
      {
        $set: {
          status: "failed",
        },
      },
    );

    const first = await reconcileTerminalImageCapacity();

    const second = await reconcileTerminalImageCapacity();

    expect(first).toContainEqual({
      assetId: queued.assetId,
      outcome: "released",
    });

    expect(second).toHaveLength(0);

    expect(await activeCount()).toBe(0);
    expect(await balance()).toBe(4);
  });

  it("handles concurrent terminal capacity repairs", async () => {
    const queued = await enqueue();

    await MediaAsset.updateOne(
      { _id: queued.assetId },
      {
        $set: {
          status: "failed",
        },
      },
    );

    await Promise.all([
      reconcileTerminalImageCapacity(),
      reconcileTerminalImageCapacity(),
    ]);

    expect(await activeCount()).toBe(0);
    expect(await balance()).toBe(4);

    const admission = await ImageGenerationAdmission.findOne({
      assetId: queued.assetId,
    });

    expect(admission?.state).toBe("released");
  });

  it("refuses recovery while a worker lease is active", async () => {
    const queued = await enqueue();

    const claimed = await claimImageGeneration(context(queued.assetId));

    await beginImageProviderCall({
      ...context(queued.assetId),
      claimToken: claimed.claimToken,
    });

    const reconciled = await reconcileVerifiedImageGeneration(
      context(queued.assetId),
      storage().bucket,
    );

    expect(reconciled.outcome).toBe("lease_active");

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.generationExecution?.phase).toBe("provider_started");

    expect(await activeCount()).toBe(1);
  });

  it("sweeps and finalizes a verified interrupted upload", async () => {
    const interrupted = await createInterruptedUpload();

    const sweep = await runImageGenerationRecoverySweep(
      interrupted.storage.bucket,
    );

    expect(sweep.inspected).toBe(1);
    expect(sweep.verifiedReady).toBe(1);
    expect(sweep.capacityReleased).toBe(1);

    const asset = await MediaAsset.findById(interrupted.queued.assetId);

    expect(asset?.status).toBe("ready");
    expect(await activeCount()).toBe(0);
    expect(await balance()).toBe(4);

    const second = await runImageGenerationRecoverySweep(
      interrupted.storage.bucket,
    );

    expect(second.inspected).toBe(0);
    expect(second.capacityReleased).toBe(0);
  });

  it("never regenerates an expired provider-started job during recovery", async () => {
    const queued = await enqueue();

    const claimed = await claimImageGeneration(context(queued.assetId));

    await beginImageProviderCall({
      ...context(queued.assetId),
      claimToken: claimed.claimToken,
    });

    await expireLease(queued.assetId);

    const s = storage();

    const sweep = await runImageGenerationRecoverySweep(s.bucket);

    expect(sweep.inspected).toBe(1);
    expect(sweep.verifiedReady).toBe(0);
    expect(sweep.needsReview).toBe(1);

    expect(s.upload).not.toHaveBeenCalled();

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("pending");

    expect(asset?.generationExecution?.phase).toBe("recovery_required");

    expect(await activeCount()).toBe(1);
    expect(await balance()).toBe(4);
  });
});
