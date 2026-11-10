import "dotenv/config";

import mongoose from "mongoose";

import MediaAsset from "../models/MediaAsset.js";

import { ImageGenerationAdmission } from "../models/ImageGenerationAccounting.js";

import { discoverReservedImageJobs } from "../services/imageGenerationWorkerService.js";

async function main() {
  const mongoUri = process.env.IMAGE_WORKER_MONGODB_URI;

  if (!mongoUri) {
    throw new Error("IMAGE_WORKER_MONGODB_URI is missing.");
  }

  await mongoose.connect(mongoUri);

  try {
    const assets = await MediaAsset.find({
      type: "image",
      source: "ai-generated",
      status: "pending",
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log("Pending AI image assets:", assets.length);

    for (const asset of assets) {
      const admission = await ImageGenerationAdmission.findOne({
        assetId: asset._id,
      }).lean();

      const execution = asset.generationExecution;

      const provider = asset.generation?.provider;

      const model = asset.generation?.model;

      const phase = execution?.phase;

      const expiredClaim =
        phase === "claimed" &&
        execution?.leaseExpiresAt != null &&
        new Date(execution.leaseExpiresAt).getTime() <= Date.now() &&
        !execution.providerStartedAt;

      const eligiblePhase = phase === "reserved" || expiredClaim;

      const providerMatches =
        provider === "mock" && model === "storm-mock-image-v1";

      const admissionMatches =
        admission?.state === "active" &&
        (admission?.creditsCharged ?? 0) > 0 &&
        String(admission?.workspaceId) === String(asset.workspaceId) &&
        String(admission?.userId) === String(asset.createdByUserId);

      console.log({
        assetId: String(asset._id),
        status: asset.status,
        provider,
        model,
        phase,
        hasIdempotencyKey: typeof asset.idempotencyKey === "string",
        hasRequestFingerprint: typeof asset.requestFingerprint === "string",
        eligiblePhase,
        hasProviderStartedAt: Boolean(execution?.providerStartedAt),
        admissionState: admission?.state ?? null,
        creditsCharged: admission?.creditsCharged ?? null,
        admissionMatches,
        providerMatches,
      });
    }

    const discoverable = await discoverReservedImageJobs(10);

    console.log("Discoverable jobs:", discoverable.length);
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unknown diagnostic failure",
  );

  process.exitCode = 1;
});
