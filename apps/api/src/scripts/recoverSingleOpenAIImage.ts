import "dotenv/config";

import mongoose from "mongoose";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";

import { ImageGenerationAdmission } from "../models/ImageGenerationAccounting.js";

import { reconcileVerifiedImageGeneration } from "../services/media/mediaGenerationReconciliationService.js";

import { releaseImageGenerationCapacity } from "../services/imageGenerationAdmissionService.js";

const ASSET_ID = "6af2d3c55bba81eee2f1be97";
const WORKSPACE_ID = "6aeba54a3fe7bf29e916b3f1";

async function main() {
  const mongoUri = process.env.IMAGE_WORKER_MONGODB_URI;

  if (!mongoUri) {
    throw new Error("IMAGE_WORKER_MONGODB_URI is missing.");
  }

  await mongoose.connect(mongoUri);

  try {
    const asset = await MediaAsset.findById(ASSET_ID);

    if (!asset) {
      throw new Error("Recovery asset not found.");
    }

    if (String(asset.workspaceId) !== WORKSPACE_ID) {
      throw new Error("Asset workspace mismatch. Recovery blocked.");
    }

    if (
      asset.generation?.provider !== "openai" ||
      asset.generation?.model !== "gpt-image-2"
    ) {
      throw new Error("Unexpected provider or model. Recovery blocked.");
    }

    const phase = asset.generationExecution?.phase;
    const leaseExpiresAt = asset.generationExecution?.leaseExpiresAt;

    const canRecover =
      asset.status === "pending" &&
      (phase === "provider_started" ||
        phase === "storage_pending" ||
        phase === "recovery_required") &&
      leaseExpiresAt instanceof Date &&
      leaseExpiresAt.getTime() <= Date.now();

    if (!canRecover) {
      console.log("[Recovery] No eligible expired operation.", {
        status: asset.status,
        phase,
      });

      return;
    }

    const admission = await ImageGenerationAdmission.findOne({
      assetId: asset._id,
      workspaceId: asset.workspaceId,
      userId: asset.createdByUserId,
    });

    if (
      !admission ||
      admission.state !== "active" ||
      admission.creditsCharged !== 1
    ) {
      throw new Error("Admission state or credit charge mismatch.");
    }

    const profile = await UserProfile.findById(asset.createdByUserId).select(
      "supabaseUserId",
    );

    if (!profile?.supabaseUserId) {
      throw new Error("Asset owner's user profile is missing.");
    }

    const authUser = {
      id: profile.supabaseUserId,
    } as Parameters<typeof releaseImageGenerationCapacity>[0];

    console.log("[Recovery] Beginning existing-object reconciliation.", {
      status: asset.status,
      phase,
      attemptCount: asset.generationExecution?.attemptCount,
      hasChecksum: Boolean(asset.contentSha256),
    });

    // Uses the existing deterministic Supabase storage key.
    // Does not call OpenAI or upload another image.
    const result = await reconcileVerifiedImageGeneration({
      authUser,
      workspaceId: WORKSPACE_ID,
      assetId: ASSET_ID,
    });

    console.log("[Recovery] Reconciliation result:", result);

    if (
      result.outcome === "verified_ready" ||
      result.outcome === "already_reconciled"
    ) {
      // Release capacity only after verified completion.
      await releaseImageGenerationCapacity(authUser, WORKSPACE_ID, ASSET_ID);

      console.log(
        "[Recovery] Verified image finalized; capacity release requested.",
      );
    } else {
      console.log("[Recovery] No automatic refund or capacity release.");
    }

    const updated = await MediaAsset.findById(ASSET_ID).select(
      "status generationExecution.phase storageKey",
    );

    const currentAdmission = await ImageGenerationAdmission.findOne({
      assetId: asset._id,
    }).select("state creditsCharged");

    console.log("[Recovery] Final asset:", {
      status: updated?.status,
      phase: updated?.generationExecution?.phase,
      hasStorageKey: Boolean(updated?.storageKey),
    });

    console.log("[Recovery] Final admission:", {
      state: currentAdmission?.state,
      creditsCharged: currentAdmission?.creditsCharged,
    });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    "[Recovery] Failed:",
    error instanceof Error ? error.name : "UnknownError",
  );

  process.exitCode = 1;
});
