import "dotenv/config";

import mongoose from "mongoose";

import MediaAsset from "../models/MediaAsset.js";

async function main() {
  const uri = process.env.IMAGE_WORKER_MONGODB_URI;

  if (!uri) {
    throw new Error("IMAGE_WORKER_MONGODB_URI is missing.");
  }

  await mongoose.connect(uri);

  try {
    const databaseName = mongoose.connection.name;

    const collectionName = MediaAsset.collection.name;

    const totalAssets = await MediaAsset.countDocuments();

    const recentAssets = await MediaAsset.find({})
      .select(
        "_id type source status generation.provider generation.model generationExecution.phase createdAt",
      )
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log({
      databaseName,
      collectionName,
      totalAssets,
    });

    console.log(
      "Recent media assets:",
      recentAssets.map((asset) => ({
        assetId: String(asset._id),
        type: asset.type,
        source: asset.source,
        status: asset.status,
        provider: asset.generation?.provider,
        model: asset.generation?.model,
        phase: asset.generationExecution?.phase,
        createdAt: asset.createdAt,
      })),
    );
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown error");

  process.exitCode = 1;
});
