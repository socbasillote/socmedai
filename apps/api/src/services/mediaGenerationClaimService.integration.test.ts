import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import {
  beginImageProviderCall,
  claimImageGeneration,
  fingerprintImageGeneration,
  reserveImageGeneration,
} from "./mediaGenerationClaimService.js";

let mongo: MongoMemoryServer;

const userA = {
  id: "generation-user-a",
} as AuthenticatedUser;

const userB = {
  id: "generation-user-b",
} as AuthenticatedUser;

let workspaceA: string;
let workspaceB: string;

const requestKey = "generation-test-request-0001";

const image = {
  prompt: "A premium product photograph on a clean wooden desk.",
  aspectRatio: "square" as const,
};

const generation = {
  provider: "openai",
  model: "test-image-model",
};

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    authUser: userA,
    workspaceId: workspaceA,
    idempotencyKey: requestKey,
    image,
    generation,
    ...overrides,
  };
}

async function reserve() {
  return reserveImageGeneration(reservation());
}

async function contextForNewAsset() {
  const result = await reserve();

  return {
    authUser: userA,
    workspaceId: workspaceA,
    assetId: String(result.asset._id),
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

describe("Image generation reservation", () => {
  it("creates one durable reserved asset", async () => {
    const result = await reserve();

    expect(result.created).toBe(true);
    expect(result.asset.status).toBe("pending");

    expect(result.asset.generationExecution?.phase).toBe("reserved");

    expect(result.asset.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);

    expect(await MediaAsset.countDocuments({})).toBe(1);
  });

  it("returns the existing asset for a retry", async () => {
    const first = await reserve();
    const retry = await reserve();

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);

    expect(String(retry.asset._id)).toBe(String(first.asset._id));

    expect(await MediaAsset.countDocuments({})).toBe(1);
  });

  it("normalizes equivalent prompts", async () => {
    const first = await reserve();

    const retry = await reserveImageGeneration(
      reservation({
        image: {
          ...image,
          prompt: `  ${image.prompt}  `,
        },
      }),
    );

    expect(retry.created).toBe(false);

    expect(String(retry.asset._id)).toBe(String(first.asset._id));
  });

  it("rejects reuse of a key with a different prompt", async () => {
    await reserve();

    await expect(
      reserveImageGeneration(
        reservation({
          image: {
            ...image,
            prompt: "A completely different premium product photograph.",
          },
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects a changed backend model under the same key", async () => {
    await reserve();

    await expect(
      reserveImageGeneration(
        reservation({
          generation: {
            ...generation,
            model: "another-test-model",
          },
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("allows only one reservation during a race", async () => {
    const results = await Promise.all([
      reserve(),
      reserve(),
      reserve(),
      reserve(),
    ]);

    const ids = results.map((result) => String(result.asset._id));

    expect(new Set(ids).size).toBe(1);

    expect(results.filter((result) => result.created)).toHaveLength(1);

    expect(await MediaAsset.countDocuments({})).toBe(1);
  });

  it("scopes identical keys to different workspaces", async () => {
    const first = await reserve();

    const second = await reserveImageGeneration(
      reservation({
        authUser: userB,
        workspaceId: workspaceB,
      }),
    );

    expect(second.created).toBe(true);

    expect(String(first.asset._id)).not.toBe(String(second.asset._id));

    expect(await MediaAsset.countDocuments({})).toBe(2);
  });

  it("rejects another user's workspace", async () => {
    await expect(
      reserveImageGeneration(
        reservation({
          authUser: userB,
          workspaceId: workspaceA,
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects invalid idempotency keys", async () => {
    await expect(
      reserveImageGeneration(
        reservation({
          idempotencyKey: "short",
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("produces a deterministic request fingerprint", () => {
    const first = fingerprintImageGeneration(image, generation);

    const second = fingerprintImageGeneration(image, generation);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("Image generation claim ownership", () => {
  it("allows one worker to claim a reserved asset", async () => {
    const context = await contextForNewAsset();

    const claimed = await claimImageGeneration(context);

    expect(claimed.asset.generationExecution?.phase).toBe("claimed");

    expect(claimed.claimToken).toMatch(/^[a-f0-9-]{36}$/);

    expect(claimed.asset.generationExecution?.attemptCount).toBe(1);
  });

  it("allows only one simultaneous worker claim", async () => {
    const context = await contextForNewAsset();

    const results = await Promise.allSettled([
      claimImageGeneration(context),
      claimImageGeneration(context),
      claimImageGeneration(context),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(2);
  });

  it("allows reclaiming an expired pre-provider lease", async () => {
    const context = await contextForNewAsset();

    const first = await claimImageGeneration(context);

    // Simulate passage of time without waiting.
    await MediaAsset.collection.updateOne(
      { _id: first.asset._id },
      {
        $set: {
          "generationExecution.leaseExpiresAt": new Date(Date.now() - 10_000),
        },
      },
    );

    const second = await claimImageGeneration(context);

    expect(second.claimToken).not.toBe(first.claimToken);

    expect(second.asset.generationExecution?.attemptCount).toBe(2);
  });

  it("rejects a stale worker claim token", async () => {
    const context = await contextForNewAsset();

    const first = await claimImageGeneration(context);

    await MediaAsset.collection.updateOne(
      { _id: first.asset._id },
      {
        $set: {
          "generationExecution.leaseExpiresAt": new Date(Date.now() - 10_000),
        },
      },
    );

    const second = await claimImageGeneration(context);

    await expect(
      beginImageProviderCall({
        ...context,
        claimToken: first.claimToken,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    const started = await beginImageProviderCall({
      ...context,
      claimToken: second.claimToken,
    });

    expect(started.generationExecution?.phase).toBe("provider_started");
  });

  it("never reclaims a provider-started operation", async () => {
    const context = await contextForNewAsset();

    const claim = await claimImageGeneration(context);

    await beginImageProviderCall({
      ...context,
      claimToken: claim.claimToken,
    });

    // Even an expired provider-started lease
    // must not trigger another paid call.
    await MediaAsset.collection.updateOne(
      { _id: claim.asset._id },
      {
        $set: {
          "generationExecution.leaseExpiresAt": new Date(Date.now() - 10_000),
        },
      },
    );

    await expect(claimImageGeneration(context)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects beginning a provider call with an expired claim", async () => {
    const context = await contextForNewAsset();

    const claim = await claimImageGeneration(context);

    await MediaAsset.collection.updateOne(
      { _id: claim.asset._id },
      {
        $set: {
          "generationExecution.leaseExpiresAt": new Date(Date.now() - 10_000),
        },
      },
    );

    await expect(
      beginImageProviderCall({
        ...context,
        claimToken: claim.claimToken,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("records provider start only once", async () => {
    const context = await contextForNewAsset();

    const claim = await claimImageGeneration(context);

    const first = await beginImageProviderCall({
      ...context,
      claimToken: claim.claimToken,
    });

    expect(first.generationExecution?.providerStartedAt).toBeInstanceOf(Date);

    await expect(
      beginImageProviderCall({
        ...context,
        claimToken: claim.claimToken,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
