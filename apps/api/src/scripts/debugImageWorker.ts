import "dotenv/config";

import mongoose from "mongoose";

import { discoverReservedImageJobs } from "../services/imageGenerationWorkerService.js";

async function main() {
  const mongoUri = process.env.IMAGE_WORKER_MONGODB_URI;

  if (!mongoUri) {
    throw new Error("IMAGE_WORKER_MONGODB_URI is required.");
  }

  await mongoose.connect(mongoUri);

  try {
    const jobs = await discoverReservedImageJobs(10);

    console.log("Discoverable image jobs:", jobs.length);

    for (const job of jobs) {
      console.log({
        assetId: String(job._id),
        workspaceId: String(job.workspaceId),
      });
    }
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown error");

  process.exitCode = 1;
});
