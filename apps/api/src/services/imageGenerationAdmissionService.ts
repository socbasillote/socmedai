import mongoose from "mongoose";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";

import {
  UserCreditWallet,
  ImageDailyUsage,
  ImageWorkspaceCapacity,
  ImageGenerationAdmission,
} from "../models/ImageGenerationAccounting.js";

import {
  generateImageSchema,
  type GenerateImageInput,
} from "../schemas/aiImageSchema.js";

import { fingerprintImageGeneration } from "./mediaGenerationClaimService.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import CreditTransaction from "../models/CreditTransaction.js";

import { snapshotWorkspaceLogoSettings } from "./media/workspaceLogoConfig.js";

export const IMAGE_CREDIT_COST = 1;

export type ImageAdmissionFaultInjection = {
  beforeDebitLedgerInsert?: () => void | Promise<void>;
};

export class ImageAdmissionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ImageAdmissionError";
  }
}

type AdmissionInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  idempotencyKey: string;
  image: GenerateImageInput;
  generation: {
    provider: string;
    model: string;
  };
  policy: {
    dailyLimit: number;
    maxActive: number;
  };
  faultInjection?: ImageAdmissionFaultInjection;
};

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function duplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function transient(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "hasErrorLabel" in error &&
    typeof error.hasErrorLabel === "function" &&
    error.hasErrorLabel("TransientTransactionError") === true
  );
}

/**
 * Bounded delay between admission retries.
 *
 * Only use this for database contention.
 * Never use it to retry provider execution.
 */
async function admissionRetryDelay(attempt: number): Promise<void> {
  const delayMs = Math.min(20 * 2 ** attempt, 160);

  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function utcUsageDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Performs authorization and all accounting in
 * the same MongoDB transaction.
 *
 * Caller must not invoke the existing standalone
 * reserveImageGeneration() as a replacement for
 * this credit-aware admission operation.
 */
export async function admitImageGeneration(input: AdmissionInput) {
  if (!mongoose.isObjectIdOrHexString(input.workspaceId)) {
    throw new ImageAdmissionError("Workspace not found.", 404);
  }

  if (!KEY_PATTERN.test(input.idempotencyKey)) {
    throw new ImageAdmissionError("Invalid idempotency key.", 400);
  }

  const parsed = generateImageSchema.safeParse(input.image);

  if (!parsed.success) {
    throw new ImageAdmissionError("Invalid image generation request.", 400);
  }

  const provider = input.generation.provider.trim();
  const model = input.generation.model.trim();

  if (!provider || provider.length > 80 || !model || model.length > 120) {
    throw new ImageAdmissionError("Invalid image provider configuration.", 500);
  }

  const { dailyLimit, maxActive } = input.policy;

  if (
    !Number.isSafeInteger(dailyLimit) ||
    dailyLimit < 1 ||
    !Number.isSafeInteger(maxActive) ||
    maxActive < 1
  ) {
    throw new ImageAdmissionError(
      "Invalid generation quota configuration.",
      500,
    );
  }

  const fingerprint = fingerprintImageGeneration(parsed.data, {
    provider,
    model,
  });

  const lookup = {
    workspaceId: new mongoose.Types.ObjectId(input.workspaceId),
    idempotencyKey: input.idempotencyKey,
  };

  async function existingResult() {
    const profile = await UserProfile.findOne({
      supabaseUserId: input.authUser.id,
    }).select("_id");

    const workspace = profile
      ? await Workspace.findOne({
          _id: lookup.workspaceId,
          ownerUserId: profile._id,
        }).select("_id")
      : null;

    if (!workspace) {
      throw new ImageAdmissionError("Workspace not found.", 404);
    }

    const existing = await MediaAsset.findOne(lookup);

    if (!existing) {
      return null;
    }

    if (existing.requestFingerprint !== fingerprint) {
      throw new ImageAdmissionError(
        "Idempotency key was used with different settings.",
        409,
      );
    }

    // The asset must be tied to a committed debit.
    const admission = await ImageGenerationAdmission.findOne({
      assetId: existing._id,
    });

    if (!admission) {
      throw new ImageAdmissionError(
        "Generation accounting is inconsistent.",
        409,
      );
    }

    return {
      asset: existing,
      created: false,
      creditsChargedNow: 0,
    };
  }

  /**
   * Retry only bounded database contention.
   * Never retry a paid provider request here.
   */
  for (let attempt = 0; attempt < 5; attempt++) {
    const session = await mongoose.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const profile = await UserProfile.findOne({
          supabaseUserId: input.authUser.id,
        })
          .select("_id")
          .session(session);

        if (!profile) {
          throw new ImageAdmissionError("Workspace not found.", 404);
        }

        const workspace = await Workspace.findOne({
          _id: lookup.workspaceId,
          ownerUserId: profile._id,
        })
          .select("_id settings")
          .session(session);

        if (!workspace) {
          throw new ImageAdmissionError("Workspace not found.", 404);
        }

        // Freeze workspace branding for this
        // generation before creating the asset.
        //
        // Read from the authorized workspace
        // inside the current MongoDB transaction.
        const workspaceSettings =
          workspace.settings &&
          typeof workspace.settings === "object" &&
          !Array.isArray(workspace.settings)
            ? (workspace.settings as Record<string, unknown>)
            : {};

        let logoOverlaySnapshot;

        try {
          logoOverlaySnapshot = snapshotWorkspaceLogoSettings(
            workspaceSettings.logoOverlay,
            String(workspace._id),
          );
        } catch {
          throw new ImageAdmissionError(
            "Workspace logo settings are invalid.",
            409,
          );
        }

        // Idempotent retries consume nothing.
        const existing = await MediaAsset.findOne(lookup).session(session);

        if (existing) {
          if (existing.requestFingerprint !== fingerprint) {
            throw new ImageAdmissionError(
              "Idempotency key was used with different settings.",
              409,
            );
          }

          const ledger = await ImageGenerationAdmission.findOne({
            assetId: existing._id,
          }).session(session);

          if (!ledger) {
            throw new ImageAdmissionError(
              "Generation accounting is inconsistent.",
              409,
            );
          }

          return {
            asset: existing,
            created: false,
            creditsChargedNow: 0,
          };
        }

        const now = new Date();
        const dayUtc = utcUsageDay(now);

        // Create counter documents if absent.
        await ImageDailyUsage.updateOne(
          {
            workspaceId: workspace._id,
            dayUtc,
          },
          {
            $setOnInsert: {
              attempts: 0,
            },
          },
          { upsert: true, session },
        );

        await ImageWorkspaceCapacity.updateOne(
          { workspaceId: workspace._id },
          {
            $setOnInsert: {
              active: 0,
            },
          },
          { upsert: true, session },
        );

        const charged = await UserCreditWallet.findOneAndUpdate(
          {
            userId: profile._id,
            balance: {
              $gte: IMAGE_CREDIT_COST,
            },
          },
          {
            $inc: {
              balance: -IMAGE_CREDIT_COST,
            },
          },
          {
            returnDocument: "after",
            session,
            runValidators: true,
          },
        );

        if (!charged) {
          throw new ImageAdmissionError("Insufficient credits.", 402);
        }

        const daily = await ImageDailyUsage.updateOne(
          {
            workspaceId: workspace._id,
            dayUtc,
            attempts: { $lt: dailyLimit },
          },
          { $inc: { attempts: 1 } },
          { session },
        );

        if (daily.modifiedCount !== 1) {
          throw new ImageAdmissionError(
            "Daily image generation limit reached.",
            429,
          );
        }

        const capacity = await ImageWorkspaceCapacity.updateOne(
          {
            workspaceId: workspace._id,
            active: { $lt: maxActive },
          },
          { $inc: { active: 1 } },
          { session },
        );

        if (capacity.modifiedCount !== 1) {
          throw new ImageAdmissionError(
            "Too many active image generations.",
            429,
          );
        }

        const [asset] = await MediaAsset.create(
          [
            {
              workspaceId: workspace._id,
              createdByUserId: profile._id,
              status: "pending",
              type: "image",
              source: "ai-generated",
              storageProvider: "supabase",
              generation: {
                provider,
                model,
                prompt: parsed.data.prompt,
                aspectRatio: parsed.data.aspectRatio,
              },
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: fingerprint,
              generationExecution: {
                phase: "reserved",
                attemptCount: 0,
              },
              logoOverlaySnapshot,
            },
          ],
          { session },
        );

        if (!asset) {
          throw new Error("Media asset creation failed.");
        }

        await ImageGenerationAdmission.create(
          [
            {
              assetId: asset._id,
              workspaceId: workspace._id,
              userId: profile._id,
              dayUtc,
              creditsCharged: IMAGE_CREDIT_COST,
              state: "active",
            },
          ],
          { session },
        );

        await input.faultInjection?.beforeDebitLedgerInsert?.();

        await CreditTransaction.create(
          [
            {
              userId: profile._id,
              assetId: asset._id,

              eventKey: `debit:${String(asset._id)}`,

              type: "image_debit",

              amount: -IMAGE_CREDIT_COST,

              balanceAfter: charged.balance,

              reason: "image_generation",
            },
          ],
          { session },
        );

        return {
          asset,
          created: true,
          creditsChargedNow: IMAGE_CREDIT_COST,
        };
      });

      return result;
    } catch (error) {
      if (error instanceof ImageAdmissionError) {
        throw error;
      }

      if (duplicateKey(error)) {
        const winner = await existingResult();

        if (winner) return winner;
      }

      if ((duplicateKey(error) || transient(error)) && attempt < 4) {
        await admissionRetryDelay(attempt);
        continue;
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }

  throw new ImageAdmissionError(
    "Generation admission is temporarily unavailable.",
    503,
  );
}

/**
 * Release workspace capacity once the asset
 * reaches a terminal state.
 *
 * Credits and daily usage remain consumed.
 *
 * The admission's state ensures the active slot
 * can be released only once.
 */
export async function releaseImageGenerationCapacity(
  authUser: AuthenticatedUser,
  workspaceId: string,
  assetId: string,
): Promise<boolean> {
  if (
    !mongoose.isObjectIdOrHexString(workspaceId) ||
    !mongoose.isObjectIdOrHexString(assetId)
  ) {
    throw new ImageAdmissionError("Media asset not found.", 404);
  }

  return mongoose.connection.transaction(async (session) => {
    const profile = await UserProfile.findOne({
      supabaseUserId: authUser.id,
    }).session(session);

    const workspace = profile
      ? await Workspace.findOne({
          _id: workspaceId,
          ownerUserId: profile._id,
        }).session(session)
      : null;

    if (!workspace) {
      throw new ImageAdmissionError("Workspace not found.", 404);
    }

    const asset = await MediaAsset.findOne({
      _id: assetId,
      workspaceId: workspace._id,
      status: { $in: ["ready", "failed"] },
    }).session(session);

    if (!asset) {
      throw new ImageAdmissionError("Generation is not terminal.", 409);
    }

    const admission = await ImageGenerationAdmission.findOneAndUpdate(
      {
        assetId: asset._id,
        workspaceId: workspace._id,
        state: "active",
      },
      {
        $set: { state: "released" },
      },
      {
        session,
        returnDocument: "after",
      },
    );

    if (!admission) {
      // Already released, or not an
      // admitted generation.
      const existing = await ImageGenerationAdmission.findOne({
        assetId: asset._id,
        workspaceId: workspace._id,
      }).session(session);

      if (!existing) {
        throw new ImageAdmissionError("Generation accounting is missing.", 409);
      }

      return false;
    }

    const updated = await ImageWorkspaceCapacity.updateOne(
      {
        workspaceId: workspace._id,
        active: { $gte: 1 },
      },
      {
        $inc: { active: -1 },
      },
      { session },
    );

    if (updated.modifiedCount !== 1) {
      throw new ImageAdmissionError(
        "Generation capacity is inconsistent.",
        409,
      );
    }

    return true;
  });
}
