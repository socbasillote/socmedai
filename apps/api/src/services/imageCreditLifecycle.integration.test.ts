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
import CreditTransaction from "../models/CreditTransaction.js";

import { admitImageGeneration } from "./imageGenerationAdmissionService.js";

import {
  UserCreditWallet,
  ImageDailyUsage,
  ImageWorkspaceCapacity,
  ImageGenerationAdmission,
} from "../models/ImageGenerationAccounting.js";

import { parseImageGenerationConfig } from "../config/imageGenerationConfig.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import { grantUserCredits } from "./creditGrantService.js";

import { enqueueImageGeneration } from "./imageGenerationQueueService.js";

import { refundUnstartedImageGeneration } from "./imageGenerationRefundService.js";

import { auditImageCreditAccounting } from "./imageCreditBillingAuditService.js";

import {
  claimImageGeneration,
  beginImageProviderCall,
} from "./mediaGenerationClaimService.js";

let mongo: MongoMemoryReplSet;
let userId: mongoose.Types.ObjectId;
let workspaceId: string;
let sequence = 0;

const authUser = {
  id: "credit-lifecycle-test-user",
} as AuthenticatedUser;

const config = parseImageGenerationConfig({
  IMAGE_GENERATION_PROVIDER: "mock",
  IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT: "10",
  IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE: "2",
});

async function balance() {
  const wallet = await UserCreditWallet.findOne({
    userId,
  });

  return wallet?.balance ?? 0;
}

async function active() {
  const capacity = await ImageWorkspaceCapacity.findOne({
    workspaceId,
  });

  return capacity?.active ?? 0;
}

async function enqueue() {
  sequence++;

  return enqueueImageGeneration({
    authUser,
    config,
    command: {
      workspaceId,
      idempotencyKey: `credit-lifecycle-${String(sequence).padStart(8, "0")}`,
      image: {
        prompt: "A cinematic professional product photograph.",
        aspectRatio: "square",
      },
    },
  });
}

function refundInput(assetId: string) {
  return {
    authUser,
    workspaceId,
    assetId,
  };
}

function grantInput(grantKey = "credit-lifecycle-grant-0001", amount = 3) {
  return {
    userId: String(userId),
    grantKey,
    amount,
    reason: "development_seed" as const,
  };
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  await mongoose.connect(mongo.getUri());

  await Promise.all([
    MediaAsset.createIndexes(),
    CreditTransaction.createIndexes(),
    UserCreditWallet.createIndexes(),
    ImageDailyUsage.createIndexes(),
    ImageWorkspaceCapacity.createIndexes(),
    ImageGenerationAdmission.createIndexes(),
  ]);
});

beforeEach(async () => {
  sequence = 0;

  await Promise.all([
    CreditTransaction.deleteMany({}),
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
    name: "Credit Lifecycle Workspace",
  });

  // Simulates a wallet created before this
  // checkpoint's ledger was introduced.
  await UserCreditWallet.create({
    userId,
    balance: 5,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("Image credit lifecycle", () => {
  it("creates a trusted grant and ledger event atomically", async () => {
    const result = await grantUserCredits(grantInput());

    expect(result).toMatchObject({
      amount: 3,
      created: true,
      balance: 8,
    });

    expect(await balance()).toBe(8);

    const event = await CreditTransaction.findOne({
      eventKey: result.eventKey,
    });

    expect(event?.type).toBe("grant");
    expect(event?.amount).toBe(3);
    expect(event?.balanceAfter).toBe(8);
  });

  it("does not apply an identical grant twice", async () => {
    const first = await grantUserCredits(grantInput());

    const retry = await grantUserCredits(grantInput());

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);

    expect(await balance()).toBe(8);

    expect(
      await CreditTransaction.countDocuments({
        type: "grant",
      }),
    ).toBe(1);
  });

  it("rejects reuse of a grant key with different details", async () => {
    await grantUserCredits(grantInput());

    await expect(
      grantUserCredits(grantInput("credit-lifecycle-grant-0001", 10)),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(await balance()).toBe(8);
  });

  it("records an image debit without an additional wallet mutation", async () => {
    const queued = await enqueue();

    expect(queued.creditsChargedNow).toBe(1);
    expect(await balance()).toBe(4);

    const debit = await CreditTransaction.findOne({
      eventKey: `debit:${queued.assetId}`,
    });

    expect(debit).toMatchObject({
      type: "image_debit",
      amount: -1,
      balanceAfter: 4,
    });

    expect(String(debit?.assetId)).toBe(queued.assetId);
  });

  it("does not create another debit on an idempotent retry", async () => {
    const first = await enqueueImageGeneration({
      authUser,
      config,
      command: {
        workspaceId,
        idempotencyKey: "credit-duplicate-request-0001",
        image: {
          prompt: "An elegant commercial product photograph.",
          aspectRatio: "square",
        },
      },
    });

    const second = await enqueueImageGeneration({
      authUser,
      config,
      command: {
        workspaceId,
        idempotencyKey: "credit-duplicate-request-0001",
        image: {
          prompt: "An elegant commercial product photograph.",
          aspectRatio: "square",
        },
      },
    });

    expect(first.assetId).toBe(second.assetId);
    expect(second.creditsChargedNow).toBe(0);

    expect(await balance()).toBe(4);

    expect(
      await CreditTransaction.countDocuments({
        type: "image_debit",
      }),
    ).toBe(1);
  });

  it("refunds an unstarted reservation exactly once", async () => {
    const queued = await enqueue();

    expect(await balance()).toBe(4);
    expect(await active()).toBe(1);

    const refunded = await refundUnstartedImageGeneration(
      refundInput(queued.assetId),
    );

    expect(refunded).toEqual({
      assetId: queued.assetId,
      refunded: true,
      amount: 1,
    });

    expect(await balance()).toBe(5);
    expect(await active()).toBe(0);

    const asset = await MediaAsset.findById(queued.assetId);

    expect(asset?.status).toBe("failed");

    const refund = await CreditTransaction.findOne({
      eventKey: `refund:${queued.assetId}`,
    });

    expect(refund?.type).toBe("refund");
    expect(refund?.amount).toBe(1);

    const repeat = await refundUnstartedImageGeneration(
      refundInput(queued.assetId),
    );

    expect(repeat.refunded).toBe(false);
    expect(await balance()).toBe(5);
  });

  it("refuses a refund after the provider-start boundary", async () => {
    const queued = await enqueue();

    const context = {
      authUser,
      workspaceId,
      assetId: queued.assetId,
    };

    const claimed = await claimImageGeneration(context);

    await beginImageProviderCall({
      ...context,
      claimToken: claimed.claimToken,
    });

    await expect(
      refundUnstartedImageGeneration(refundInput(queued.assetId)),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(await balance()).toBe(4);
    expect(await active()).toBe(1);

    expect(
      await CreditTransaction.countDocuments({
        type: "refund",
      }),
    ).toBe(0);
  });

  it("prevents double refunds under concurrent requests", async () => {
    const queued = await enqueue();

    const results = await Promise.all([
      refundUnstartedImageGeneration(refundInput(queued.assetId)),
      refundUnstartedImageGeneration(refundInput(queued.assetId)),
    ]);

    expect(results.filter((r) => r.refunded)).toHaveLength(1);

    expect(await balance()).toBe(5);
    expect(await active()).toBe(0);

    expect(
      await CreditTransaction.countDocuments({
        type: "refund",
      }),
    ).toBe(1);
  });

  it("reports an accounting-clean image admission", async () => {
    await enqueue();

    const report = await auditImageCreditAccounting();

    expect(report.inspected).toBe(1);
    expect(report.clean).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("detects missing historical debit records without silently fixing them", async () => {
    const queued = await enqueue();

    await CreditTransaction.deleteOne({
      eventKey: `debit:${queued.assetId}`,
    });

    const report = await auditImageCreditAccounting();

    expect(report.clean).toBe(false);

    expect(report.issues).toContainEqual({
      assetId: queued.assetId,
      code: "missing_debit",
    });

    // Read-only auditing must never change
    // anyone's wallet balance.
    expect(await balance()).toBe(4);
  });

  it("rolls back the full admission when ledger insertion fails", async () => {
    let faultReached = false;

    let caughtError: unknown;

    try {
      await admitImageGeneration({
        authUser,
        workspaceId,
        idempotencyKey: "credit-rollback-request-0001",

        image: {
          prompt: "A cinematic professional product photograph.",
          aspectRatio: "square",
        },

        generation: {
          provider: "mock",
          model: "storm-mock-image-v1",
        },

        policy: {
          dailyLimit: 10,
          maxActive: 2,
        },

        faultInjection: {
          beforeDebitLedgerInsert: () => {
            faultReached = true;

            throw new Error("Simulated credit ledger write failure");
          },
        },
      });
    } catch (error) {
      caughtError = error;
    }

    console.log("Fault callback reached:", faultReached);

    console.log(
      "Actual error:",
      caughtError instanceof Error ? caughtError.stack : caughtError,
    );

    expect(faultReached).toBe(true);

    expect(caughtError).toBeInstanceOf(Error);

    expect((caughtError as Error).message).toBe(
      "Simulated credit ledger write failure",
    );

    expect(await balance()).toBe(5);
    expect(await active()).toBe(0);

    expect(await MediaAsset.countDocuments()).toBe(0);

    expect(await ImageGenerationAdmission.countDocuments()).toBe(0);

    expect(
      await CreditTransaction.countDocuments({
        type: "image_debit",
      }),
    ).toBe(0);
  });

  it("applies a concurrent duplicate grant only once", async () => {
    const results = await Promise.all([
      grantUserCredits(grantInput("concurrent-credit-grant-0001", 2)),
      grantUserCredits(grantInput("concurrent-credit-grant-0001", 2)),
    ]);

    expect(results.filter((r) => r.created)).toHaveLength(1);

    expect(await balance()).toBe(7);

    expect(
      await CreditTransaction.countDocuments({
        eventKey: "grant:concurrent-credit-grant-0001",
      }),
    ).toBe(1);
  });
});
