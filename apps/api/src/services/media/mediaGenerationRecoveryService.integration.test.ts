import { createHash } from "node:crypto";
import mongoose from "mongoose";
import sharp from "sharp";
import { MongoMemoryServer } from "mongodb-memory-server";

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
  reserveImageGeneration,
  claimImageGeneration,
  beginImageProviderCall,
} from "../mediaGenerationClaimService.js";

import {
  getImageStorageKey,
  type ImageStorageBucket,
} from "./supabaseImageStorage.js";

import {
  flagExpiredGeneration,
  inspectGenerationRecovery,
  inspectStoredGeneration,
  listExpiredGenerationIds,
} from "./mediaGenerationRecoveryService.js";

let mongo: MongoMemoryServer;

const userA = {
  id: "recovery-test-user-a",
} as AuthenticatedUser;

const userB = {
  id: "recovery-test-user-b",
} as AuthenticatedUser;

let workspaceA: string;
let workspaceB: string;

function fakeBucket() {
  const objects = new Map<string, Uint8Array>();

  const upload = vi.fn(
    async (
      key: string,
      bytes: ArrayBuffer,
    ): Promise<{ error: { message: string } | null }> => {
      objects.set(key, new Uint8Array(bytes));
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
          error: { message: "Unavailable" },
        };
      }

      return {
        data: new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer]),
        error: null,
      };
    },
  );

  const remove = vi.fn(
    async (): Promise<{ error: { message: string } | null }> => ({
      error: null,
    }),
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
      width: 96,
      height: 96,
      channels: 3,
      background: "#7c3aed",
    },
  })
    .png()
    .toBuffer();
}

async function reserve() {
  const reserved = await reserveImageGeneration({
    authUser: userA,
    workspaceId: workspaceA,
    idempotencyKey: `recovery-${new mongoose.Types.ObjectId()}`,
    image: {
      prompt: "A beautiful product photo on a wooden desk.",
      aspectRatio: "square",
    },
    generation: {
      provider: "openai",
      model: "test-image-model",
    },
  });

  return {
    authUser: userA,
    workspaceId: workspaceA,
    assetId: String(reserved.asset._id),
  };
}

async function startProvider() {
  const context = await reserve();
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

  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();

  await Workspace.collection.insertMany([
    {
      _id: a,
      ownerUserId: profileA,
      name: "Workspace A",
    },
    {
      _id: b,
      ownerUserId: profileB,
      name: "Workspace B",
    },
  ]);

  workspaceA = String(a);
  workspaceB = String(b);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("Media generation crash recovery", () => {
  it("identifies a reserved generation as safe to claim", async () => {
    const context = await reserve();

    const state = await inspectGenerationRecovery(context);

    expect(state.outcome).toBe("safe_to_claim");
    expect(state.canClaimBeforeProvider).toBe(true);
    expect(state.canRepeatProviderCall).toBe(false);
  });

  it("identifies an expired pre-provider claim as reclaimable", async () => {
    const context = await reserve();

    await claimImageGeneration(context);
    await expireLease(context.assetId);

    const state = await inspectGenerationRecovery(context);

    expect(state.outcome).toBe("safe_to_claim");
    expect(state.canClaimBeforeProvider).toBe(true);
  });

  it("does not reclaim an active provider-started operation", async () => {
    const context = await startProvider();

    const state = await flagExpiredGeneration(context);

    expect(state.outcome).toBe("recovery_required");

    const asset = await MediaAsset.findById(context.assetId);

    // The lease has not expired, so the
    // durable phase must remain unchanged.
    expect(asset?.generationExecution?.phase).toBe("provider_started");
  });

  it("flags an expired provider call without retrying", async () => {
    const context = await startProvider();

    await expireLease(context.assetId);

    const state = await flagExpiredGeneration(context);

    expect(state.phase).toBe("recovery_required");

    const saved = await MediaAsset.findById(context.assetId);

    expect(saved?.status).toBe("pending");
    expect(saved?.generationExecution?.phase).toBe("recovery_required");
  });

  it("preserves missing storage as an uncertain result", async () => {
    const context = await startProvider();
    const storage = fakeBucket();

    await expireLease(context.assetId);

    const state = await inspectStoredGeneration(context, storage.bucket);

    expect(state.outcome).toBe("storage_unavailable");

    const saved = await MediaAsset.findById(context.assetId);

    expect(saved?.status).toBe("pending");
  });

  it("does not trust an unanchored stored image", async () => {
    const context = await startProvider();
    const storage = fakeBucket();

    await MediaAsset.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(context.assetId),
      },
      {
        $set: {
          "generationExecution.phase": "storage_pending",
        },
      },
    );

    await expireLease(context.assetId);

    storage.objects.set(
      getImageStorageKey(workspaceA, context.assetId),
      await sampleImage(),
    );

    const state = await inspectStoredGeneration(context, storage.bucket);

    expect(state.outcome).toBe("unanchored_image");

    const saved = await MediaAsset.findById(context.assetId);

    expect(saved?.status).toBe("pending");
    expect(saved?.contentSha256).toBeUndefined();
  });

  it("detects a checksum mismatch", async () => {
    const context = await startProvider();
    const storage = fakeBucket();

    await MediaAsset.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(context.assetId),
      },
      {
        $set: {
          contentSha256: "a".repeat(64),
        },
      },
    );

    await expireLease(context.assetId);

    storage.objects.set(
      getImageStorageKey(workspaceA, context.assetId),
      await sampleImage(),
    );

    const state = await inspectStoredGeneration(context, storage.bucket);

    expect(state.outcome).toBe("checksum_mismatch");
  });

  it("verifies a matching persisted checksum", async () => {
    const context = await startProvider();
    const storage = fakeBucket();

    const bytes = await sampleImage();

    const sha256 = createHash("sha256").update(bytes).digest("hex");

    // Simulate a trusted checksum persisted before
    // the process crashed. The normal completion
    // flow does not yet persist this early.
    await MediaAsset.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(context.assetId),
      },
      {
        $set: {
          contentSha256: sha256,
        },
      },
    );

    await expireLease(context.assetId);

    storage.objects.set(getImageStorageKey(workspaceA, context.assetId), bytes);

    const state = await inspectStoredGeneration(context, storage.bucket);

    expect(state.outcome).toBe("checksum_verified");

    expect(state.objectSha256).toBe(sha256);
    expect(state.canRepeatProviderCall).toBe(false);
  });

  it("rejects cross-workspace recovery inspection", async () => {
    const context = await startProvider();
    const storage = fakeBucket();

    await expireLease(context.assetId);

    await expect(
      inspectStoredGeneration(
        {
          authUser: userB,
          workspaceId: workspaceB,
          assetId: context.assetId,
        },
        storage.bucket,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(storage.download).not.toHaveBeenCalled();
  });

  it("discovers only expired operations in the authorized workspace", async () => {
    const context = await startProvider();

    await expireLease(context.assetId);

    const ids = await listExpiredGenerationIds(userA, workspaceA);

    expect(ids).toContain(context.assetId);

    const otherWorkspaceIds = await listExpiredGenerationIds(userB, workspaceB);

    expect(otherWorkspaceIds).not.toContain(context.assetId);
  });
});
