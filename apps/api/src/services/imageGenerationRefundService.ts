import mongoose from "mongoose";

import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import MediaAsset from "../models/MediaAsset.js";

import CreditTransaction from "../models/CreditTransaction.js";

import {
  UserCreditWallet,
  ImageWorkspaceCapacity,
  ImageGenerationAdmission,
} from "../models/ImageGenerationAccounting.js";

import type { AuthenticatedUser } from "./userProfileService.js";

export class ImageRefundError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ImageRefundError";
  }
}

type RefundInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  assetId: string;
};

export type ImageRefundResult = {
  assetId: string;
  refunded: boolean;
  amount: number;
};

function isRetryable(error: unknown) {
  if (error instanceof Error && "code" in error && error.code === 11000) {
    return true;
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "hasErrorLabel" in error &&
    typeof error.hasErrorLabel === "function" &&
    error.hasErrorLabel("TransientTransactionError")
  );
}

/**
 * Trusted internal cancellation.
 *
 * A provider_started operation is never
 * eligible, even after its lease expires.
 *
 * No refund is made for a mere timeout,
 * missing image, or ambiguous provider result.
 */
export async function refundUnstartedImageGeneration(
  input: RefundInput,
): Promise<ImageRefundResult> {
  if (
    !mongoose.isObjectIdOrHexString(input.workspaceId) ||
    !mongoose.isObjectIdOrHexString(input.assetId)
  ) {
    throw new ImageRefundError("Generation not found.", 404);
  }

  const workspaceId = new mongoose.Types.ObjectId(input.workspaceId);

  const assetId = new mongoose.Types.ObjectId(input.assetId);

  const eventKey = `refund:${input.assetId.toLowerCase()}`;

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const profile = await UserProfile.findOne({
          supabaseUserId: input.authUser.id,
        })
          .select("_id")
          .session(session);

        const workspace = profile
          ? await Workspace.findOne({
              _id: workspaceId,
              ownerUserId: profile._id,
            })
              .select("_id")
              .session(session)
          : null;

        if (!profile || !workspace) {
          throw new ImageRefundError("Generation not found.", 404);
        }

        const original = await MediaAsset.findOne({
          _id: assetId,
          workspaceId,
          createdByUserId: profile._id,
          source: "ai-generated",
        }).session(session);

        if (!original) {
          throw new ImageRefundError("Generation not found.", 404);
        }

        const previousRefund = await CreditTransaction.findOne({
          eventKey,
        }).session(session);

        if (previousRefund) {
          if (
            previousRefund.type !== "refund" ||
            String(previousRefund.userId) !== String(profile._id) ||
            String(previousRefund.assetId) !== String(assetId)
          ) {
            throw new ImageRefundError("Conflicting refund record.", 409);
          }

          return {
            assetId: input.assetId,
            refunded: false,
            amount: previousRefund.amount,
          };
        }

        const admission = await ImageGenerationAdmission.findOne({
          assetId,
          workspaceId,
          userId: profile._id,
          state: "active",
        }).session(session);

        if (
          !admission ||
          !Number.isSafeInteger(admission.creditsCharged) ||
          admission.creditsCharged <= 0
        ) {
          throw new ImageRefundError("Generation is not refundable.", 409);
        }

        // An admitted debit must have a
        // corresponding committed debit event.
        const debit = await CreditTransaction.findOne({
          eventKey: `debit:${String(assetId)}`,
          userId: profile._id,
          assetId,
          type: "image_debit",
          amount: -admission.creditsCharged,
        }).session(session);

        if (!debit) {
          throw new ImageRefundError(
            "Generation requires billing review.",
            409,
          );
        }

        const now = new Date();

        /**
         * Atomic phase fencing:
         *
         * reserved OR expired claimed,
         * and the provider was never started.
         *
         * This update races safely with
         * a worker trying to claim/start.
         */
        const cancelled = await MediaAsset.findOneAndUpdate(
          {
            _id: assetId,
            workspaceId,
            createdByUserId: profile._id,
            status: "pending",

            "generationExecution.providerStartedAt": {
              $exists: false,
            },

            $or: [
              {
                "generationExecution.phase": "reserved",
              },
              {
                "generationExecution.phase": "claimed",

                "generationExecution.leaseExpiresAt": {
                  $lte: now,
                },
              },
            ],
          },
          {
            $set: {
              status: "failed",
              failureReason: "Generation cancelled before provider invocation.",
            },
          },
          {
            new: true,
            session,
            runValidators: true,
          },
        );

        if (!cancelled) {
          throw new ImageRefundError(
            "Generation may have started and cannot be automatically refunded.",
            409,
          );
        }

        const releasedAdmission =
          await ImageGenerationAdmission.findOneAndUpdate(
            {
              _id: admission._id,
              state: "active",
            },
            {
              $set: {
                state: "released",
              },
            },
            {
              new: true,
              session,
            },
          );

        if (!releasedAdmission) {
          throw new ImageRefundError(
            "Unable to release generation admission.",
            409,
          );
        }

        const capacity = await ImageWorkspaceCapacity.findOneAndUpdate(
          {
            workspaceId,
            active: { $gte: 1 },
          },
          {
            $inc: { active: -1 },
          },
          {
            new: true,
            session,
          },
        );

        if (!capacity) {
          throw new ImageRefundError(
            "Generation capacity requires reconciliation.",
            409,
          );
        }

        const wallet = await UserCreditWallet.findOneAndUpdate(
          { userId: profile._id },
          {
            $inc: {
              balance: admission.creditsCharged,
            },
          },
          {
            new: true,
            session,
            runValidators: true,
          },
        );

        if (!wallet) {
          throw new ImageRefundError("Credit wallet is unavailable.", 409);
        }

        await CreditTransaction.create(
          [
            {
              userId: profile._id,
              assetId,
              eventKey,
              type: "refund",
              amount: admission.creditsCharged,
              balanceAfter: wallet.balance,
              reason: "cancelled_before_provider",
            },
          ],
          { session },
        );

        return {
          assetId: input.assetId,
          refunded: true,
          amount: admission.creditsCharged,
        };
      });
    } catch (error) {
      if (attempt < 7 && isRetryable(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new ImageRefundError("Refund could not be completed.", 503);
}
