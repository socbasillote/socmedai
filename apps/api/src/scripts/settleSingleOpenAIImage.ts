import "dotenv/config";

import mongoose from "mongoose";
import MediaAsset from "../models/MediaAsset.js";
import CreditTransaction from "../models/CreditTransaction.js";
import {
  ImageGenerationAdmission,
  ImageWorkspaceCapacity,
  UserCreditWallet,
} from "../models/ImageGenerationAccounting.js";

import {
  settleUncertainImageGeneration,
  type AdministrativeSettlementDecision,
} from "../services/imageGenerationAdministrativeSettlementService.js";

/** The one development canary under manual review. */
const ASSET_ID = "6af2d3c55bba81eee2f1be97";
const WORKSPACE_ID = "6aeba54a3fe7bf29e916b3f1";
const USER_ID = "6acf400f0cd983f0ce6abe49";

async function main() {
  const uri = process.env.IMAGE_WORKER_MONGODB_URI;
  if (!uri) throw new Error("IMAGE_WORKER_MONGODB_URI is missing.");

  const args = new Set(process.argv.slice(2));
  const isApply = args.has("--apply");
  const retain = args.has("--retain-debit");
  const compensate = args.has("--compensate-one-credit");
  const decision: AdministrativeSettlementDecision | null =
    retain !== compensate
      ? retain
        ? "retain_debit"
        : "compensate_one_credit"
      : null;

  if (
    isApply &&
    (!decision ||
      !args.has("--acknowledge-uncertain-outcome") ||
      (compensate && !args.has("--compensation-approved")))
  ) {
    throw new Error(
      "Explicit settlement decision and acknowledgements required.",
    );
  }

  await mongoose.connect(uri);
  try {
    const asset = await MediaAsset.findById(ASSET_ID).lean();
    const admission = await ImageGenerationAdmission.findOne({
      assetId: ASSET_ID,
    }).lean();
    const events = await CreditTransaction.find({ assetId: ASSET_ID })
      .select("eventKey type amount reason")
      .lean();
    const capacity = await ImageWorkspaceCapacity.findOne({
      workspaceId: WORKSPACE_ID,
    }).lean();
    const wallet = await UserCreditWallet.findOne({ userId: USER_ID }).lean();

    if (
      !asset ||
      !admission ||
      String(asset.workspaceId) !== WORKSPACE_ID ||
      String(asset.createdByUserId) !== USER_ID ||
      String(admission.workspaceId) !== WORKSPACE_ID ||
      String(admission.userId) !== USER_ID
    ) {
      throw new Error("Exact asset/admission ownership check failed.");
    }

    console.log("[Settlement preflight]", {
      assetId: ASSET_ID,
      status: asset.status,
      phase: asset.generationExecution?.phase,
      provider: asset.generation?.provider,
      model: asset.generation?.model,
      hasProviderStart: Boolean(asset.generationExecution?.providerStartedAt),
      hasStoredKey: Boolean(asset.storageKey),
      hasChecksum: Boolean(asset.contentSha256),
      admissionState: admission.state,
      chargedCredits: admission.creditsCharged,
      workspaceActive: capacity?.active,
      currentWalletBalance: wallet?.balance,
      events: events.map((e) => ({
        type: e.type,
        amount: e.amount,
        eventKey: e.eventKey,
      })),
      proposedDecision: decision,
      mode: isApply ? "APPLY" : "READ_ONLY",
    });

    if (!isApply) {
      console.log(
        "[Settlement] Read-only preflight complete. No records changed.",
      );
      return;
    }

    if (!args.has("--object-absence-verified")) {
      throw new Error(
        "Object absence must be independently verified before applying.",
      );
    }

    const result = await settleUncertainImageGeneration({
      assetId: ASSET_ID,
      workspaceId: WORKSPACE_ID,
      expectedUserId: USER_ID,
      decision: decision!,
    });
    console.log("[Settlement result]", result);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    "[Settlement]",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exitCode = 1;
});
