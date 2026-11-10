import mongoose from "mongoose";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import CreditTransaction from "../models/CreditTransaction.js";
import {
  ImageGenerationAdmission,
  ImageWorkspaceCapacity,
  UserCreditWallet,
} from "../models/ImageGenerationAccounting.js";

/** Restricted operational action. Never expose this function as a public route. */
export type AdministrativeSettlementDecision =
  | "retain_debit"
  | "compensate_one_credit";

export type AdministrativeSettlementInput = {
  assetId: string;
  workspaceId: string;
  expectedUserId: string;
  decision: AdministrativeSettlementDecision;
};

export type AdministrativeSettlementResult = {
  assetId: string;
  outcome: "settled" | "already_settled";
  decision: AdministrativeSettlementDecision;
  compensationAppliedNow: number;
  capacityReleasedNow: boolean;
};

export class AdministrativeSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdministrativeSettlementError";
  }
}

const RETAIN_REASON =
  "Administrative settlement: uncertain provider outcome; debit retained.";
const COMPENSATE_REASON =
  "Administrative settlement: uncertain provider outcome; credit compensated.";
const REFUND_REASON = "manual_compensation_uncertain_provider";

/**
 * One-asset administrative closure after human investigation and approval.
 * No OpenAI transport, image upload, object removal, or automatic refund.
 * Must only be invoked by a trusted operator, never from an end-user API.
 */
export async function settleUncertainImageGeneration(
  input: AdministrativeSettlementInput,
): Promise<AdministrativeSettlementResult> {
  const { assetId, workspaceId, expectedUserId, decision } = input;
  if (
    !mongoose.isObjectIdOrHexString(assetId) ||
    !mongoose.isObjectIdOrHexString(workspaceId) ||
    !mongoose.isObjectIdOrHexString(expectedUserId) ||
    (decision !== "retain_debit" && decision !== "compensate_one_credit")
  ) {
    throw new AdministrativeSettlementError(
      "Invalid administrative settlement input.",
    );
  }

  const assetObjectId = new mongoose.Types.ObjectId(assetId);
  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);
  const userObjectId = new mongoose.Types.ObjectId(expectedUserId);
  const debitKey = `debit:${assetId.toLowerCase()}`;
  const refundKey = `refund:${assetId.toLowerCase()}`;

  return mongoose.connection.transaction(async (session) => {
    // Mongoose transactions do not support parallel operations on one session.
    const profile = await UserProfile.findById(userObjectId).session(session);
    const workspace = await Workspace.findOne({
      _id: workspaceObjectId,
      ownerUserId: userObjectId,
    }).session(session);
    const asset = await MediaAsset.findOne({
      _id: assetObjectId,
      workspaceId: workspaceObjectId,
      createdByUserId: userObjectId,
      type: "image",
      source: "ai-generated",
    }).session(session);
    const admission = await ImageGenerationAdmission.findOne({
      assetId: assetObjectId,
      workspaceId: workspaceObjectId,
      userId: userObjectId,
    }).session(session);
    const debit = await CreditTransaction.findOne({
      eventKey: debitKey,
    }).session(session);
    const refund = await CreditTransaction.findOne({
      eventKey: refundKey,
    }).session(session);

    if (!profile || !workspace || !asset || !admission) {
      throw new AdministrativeSettlementError(
        "Asset ownership or admission does not match.",
      );
    }

    if (
      !debit ||
      debit.type !== "image_debit" ||
      String(debit.userId) !== expectedUserId ||
      String(debit.assetId) !== assetId ||
      debit.amount !== -admission.creditsCharged ||
      !Number.isSafeInteger(admission.creditsCharged) ||
      admission.creditsCharged !== 1
    ) {
      throw new AdministrativeSettlementError(
        "Original credit debit is inconsistent.",
      );
    }

    const expectedReason =
      decision === "retain_debit" ? RETAIN_REASON : COMPENSATE_REASON;

    // A second invocation is a read-only success only for the SAME decision.
    if (asset.status === "failed" && admission.state === "released") {
      if (
        asset.failureReason !== expectedReason ||
        (decision === "retain_debit" && refund !== null) ||
        (decision === "compensate_one_credit" &&
          (refund?.type !== "refund" ||
            refund.amount !== 1 ||
            refund.reason !== REFUND_REASON ||
            String(refund.userId) !== expectedUserId ||
            String(refund.assetId) !== assetId))
      ) {
        throw new AdministrativeSettlementError(
          "Previously settled with a different decision.",
        );
      }
      return {
        assetId,
        outcome: "already_settled",
        decision,
        compensationAppliedNow: 0,
        capacityReleasedNow: false,
      };
    }

    const execution = asset.generationExecution;
    if (
      asset.status !== "pending" ||
      admission.state !== "active" ||
      asset.generation?.provider !== "openai" ||
      asset.generation?.model !== "gpt-image-2" ||
      execution?.phase !== "recovery_required" ||
      !execution.providerStartedAt ||
      !execution.leaseExpiresAt ||
      execution.leaseExpiresAt.getTime() > Date.now() ||
      execution.attemptCount !== 1 ||
      asset.storageKey ||
      asset.contentSha256 ||
      refund
    ) {
      throw new AdministrativeSettlementError(
        "Operation is not eligible for manual settlement.",
      );
    }

    // This CAS fences another recovery or completion process. Never reset the phase.
    const terminal = await MediaAsset.findOneAndUpdate(
      {
        _id: assetObjectId,
        workspaceId: workspaceObjectId,
        createdByUserId: userObjectId,
        status: "pending",
        "generationExecution.phase": "recovery_required",
        "generationExecution.claimToken": execution.claimToken,
        "generationExecution.leaseExpiresAt": { $lte: new Date() },
        storageKey: { $exists: false },
        contentSha256: { $exists: false },
      },
      { $set: { status: "failed", failureReason: expectedReason } },
      { session, returnDocument: "after", runValidators: true },
    );
    if (!terminal) {
      throw new AdministrativeSettlementError(
        "Operation changed while settling; no changes committed.",
      );
    }

    const released = await ImageGenerationAdmission.updateOne(
      { _id: admission._id, state: "active" },
      { $set: { state: "released" } },
      { session },
    );
    if (released.modifiedCount !== 1) {
      throw new AdministrativeSettlementError("Admission release failed.");
    }

    const capacity = await ImageWorkspaceCapacity.updateOne(
      { workspaceId: workspaceObjectId, active: { $gte: 1 } },
      { $inc: { active: -1 } },
      { session },
    );
    if (capacity.modifiedCount !== 1) {
      throw new AdministrativeSettlementError(
        "Workspace capacity is inconsistent.",
      );
    }

    if (decision === "compensate_one_credit") {
      const wallet = await UserCreditWallet.findOneAndUpdate(
        { userId: userObjectId },
        { $inc: { balance: 1 } },
        { session, returnDocument: "after", runValidators: true },
      );
      if (!wallet) {
        throw new AdministrativeSettlementError(
          "Credit wallet is unavailable.",
        );
      }
      await CreditTransaction.create(
        [
          {
            userId: userObjectId,
            assetId: assetObjectId,
            eventKey: refundKey,
            type: "refund",
            amount: 1,
            balanceAfter: wallet.balance,
            reason: REFUND_REASON,
          },
        ],
        { session },
      );
    }

    return {
      assetId,
      outcome: "settled",
      decision,
      compensationAppliedNow: decision === "compensate_one_credit" ? 1 : 0,
      capacityReleasedNow: true,
    };
  });
}
