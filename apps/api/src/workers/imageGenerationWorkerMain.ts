import "dotenv/config";

import mongoose from "mongoose";

import { getImageGenerationConfig } from "../config/imageGenerationConfig.js";

import { startImageGenerationWorker } from "./imageGenerationWorkerRunner.js";

async function main() {
  if (process.env.IMAGE_GENERATION_WORKER_ENABLED !== "true") {
    throw new Error("Image generation worker is disabled.");
  }

  const config = getImageGenerationConfig();

  if (
    config.IMAGE_GENERATION_PROVIDER !== "mock" ||
    config.IMAGE_GENERATION_LIVE_ENABLED
  ) {
    throw new Error("This worker supports mock generation only.");
  }

  /**
   * Use the SAME development MongoDB database
   * as the API, including replica-set support.
   *
   * A separate env name prevents us from
   * assuming the existing API's DB variable.
   */
  const mongoUri = process.env.IMAGE_WORKER_MONGODB_URI;

  if (!mongoUri) {
    throw new Error("IMAGE_WORKER_MONGODB_URI is required.");
  }

  await mongoose.connect(mongoUri);

  console.info("Storm mock image worker connected.");

  const stop = startImageGenerationWorker({
    intervalMs: 5000,
    batchSize: 5,

    onError: () => {
      // No prompts, image bytes, access tokens,
      // or internal provider responses in logs.
      console.error("Image worker batch failed.");
    },
  });

  let shuttingDown = false;

  async function shutdown() {
    if (shuttingDown) return;

    shuttingDown = true;

    await stop();
    await mongoose.disconnect();

    console.info("Storm image worker stopped.");
  }

  process.once("SIGINT", () => {
    void shutdown()
      .then(() => {
        process.exitCode = 0;
      })
      .catch(() => {
        process.exitCode = 1;
      });
  });

  process.once("SIGTERM", () => {
    void shutdown()
      .then(() => {
        process.exitCode = 0;
      })
      .catch(() => {
        process.exitCode = 1;
      });
  });
}

void main().catch(() => {
  console.error("Storm image worker could not start.");

  process.exitCode = 1;
});
