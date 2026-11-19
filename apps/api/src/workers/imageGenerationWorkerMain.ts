import "dotenv/config";

import mongoose from "mongoose";

import { getImageGenerationConfig } from "../config/imageGenerationConfig.js";

import { startImageGenerationWorker } from "./imageGenerationWorkerRunner.js";
import { parseLiveImageGateConfig } from "../services/imageGenerationLiveGate.js";
import { LIVE_PAID_WORKER_ARMED } from "../services/imageGenerationWorkerProviderGate.js";
import { evaluateLiveAdmissionReadiness } from "../services/imageGenerationLiveAdmissionReadiness.js";

async function main() {
  console.info("[Storm Image Worker] Checking worker configuration.");
  if (process.env.IMAGE_GENERATION_WORKER_ENABLED !== "true") {
    throw new Error("Image generation worker is disabled.");
  }

  console.info("[Storm Image Worker] Loading image generation config.");
  const config = getImageGenerationConfig();

  const liveMode = config.IMAGE_GENERATION_PROVIDER === "openai";
  if (liveMode) {
    const gate = parseLiveImageGateConfig(process.env);
    if (
      !LIVE_PAID_WORKER_ARMED ||
      !evaluateLiveAdmissionReadiness(gate).ready
    ) {
      throw new Error("Live image worker is not armed or approved.");
    }
  } else if (config.IMAGE_GENERATION_LIVE_ENABLED) {
    throw new Error("Mock worker refuses live-enabled configuration.");
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

  console.info(
    liveMode
      ? "Storm gated OpenAI image worker connected."
      : "Storm mock image worker connected.",
  );

  const stop = startImageGenerationWorker({
    intervalMs: 5000,
    batchSize: liveMode ? 1 : 5,
    dependencies: {
      onFailure: (event) => console.error("[Storm Image Worker] Job interrupted.", event),
    },
    onError: (error) => {
      // No prompts, image bytes, access tokens,
      // or internal provider responses in logs.
      console.error("Image worker batch failed.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
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

void main().catch((error: unknown) => {
  const safeKnownMessages = [
    "This worker supports mock generation only.",
    "Live image generation is disabled.",
    "IMAGE_GENERATION_WORKER_ENABLED",
    "IMAGE_WORKER_MONGODB_URI",
    "Invalid image generation provider.",
    "Invalid live image rollout mode.",
    "Live image generation is unavailable.",
    "Image generation worker is disabled.",
    "Live image worker is not armed or approved.",
    "Mock worker refuses live-enabled configuration.",
  ];

  const message = error instanceof Error ? error.message : "";

  const safeMessage = safeKnownMessages.some((known) =>
    message.startsWith(known),
  )
    ? message
    : `Worker startup failed: ${
        error instanceof Error ? error.name : "UnknownError"
      }`;

  console.error("[Storm Image Worker]", safeMessage);

  process.exitCode = 1;
});
