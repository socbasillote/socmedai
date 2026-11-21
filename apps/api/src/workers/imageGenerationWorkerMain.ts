import "dotenv/config";

import mongoose from "mongoose";
import { env } from "../config/env.js";

import { getImageGenerationConfig } from "../config/imageGenerationConfig.js";

import { parseImageWorkerRunnerConfig, startImageGenerationWorker } from "./imageGenerationWorkerRunner.js";
import { parseLiveImageGateConfig } from "../services/imageGenerationLiveGate.js";
import { LIVE_PAID_WORKER_ARMED } from "../services/imageGenerationWorkerProviderGate.js";
import { evaluateLiveAdmissionReadiness } from "../services/imageGenerationLiveAdmissionReadiness.js";

async function main() {
  console.info("[Storm Image Worker] Checking worker configuration.");
  if (process.env.IMAGE_GENERATION_WORKER_ENABLED !== "true") {
    throw new Error("Image generation worker is disabled.");
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for image storage.");
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

  // Share the API's database by default; retain the existing explicit override.
  const mongoUri = process.env.IMAGE_WORKER_MONGODB_URI?.trim() ||
    process.env.MONGODB_URI?.trim();

  if (!mongoUri) {
    throw new Error("IMAGE_WORKER_MONGODB_URI or MONGODB_URI is required.");
  }

  const runnerConfig = parseImageWorkerRunnerConfig(process.env);
  let shuttingDown = false;
  let stop: (() => Promise<void>) | undefined;
  let connecting: Promise<unknown> | undefined;
  let shutdownPromise: Promise<void> | undefined;

  function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownPromise = (async () => {
      // A signal during connection must prevent the runner from starting.
      await connecting?.catch(() => undefined);
      try { await stop?.(); } finally { await mongoose.disconnect(); }
      console.info("Storm image worker stopped.");
    })();
    return shutdownPromise;
  }

  const onSignal = () => {
    void shutdown().then(() => { process.exitCode = 0; })
      .catch(() => { process.exitCode = 1; });
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    connecting = mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    await connecting;
    if (shuttingDown) { await shutdown(); return; }

    if (runnerConfig.changeStreamEnabled) {
      try {
        const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
        if (!hello.setName && hello.msg !== "isdbgrid") {
          console.warn("[Storm Image Worker] MongoDB has no replica set or sharding; fallback polling remains active.");
        } else {
          console.info("[Storm Image Worker] MongoDB topology supports Change Streams.");
        }
      } catch {
        console.warn("[Storm Image Worker] MongoDB topology check unavailable; fallback polling remains active.");
      }
      if (shuttingDown) { await shutdown(); return; }
    }

    console.info(
      liveMode
        ? "Storm gated OpenAI image worker connected."
        : "Storm mock image worker connected.",
    );

    stop = startImageGenerationWorker({
      ...runnerConfig,
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

  } catch (error) {
    await shutdown();
    throw error;
  }
}

void main().catch((error: unknown) => {
  const safeKnownMessages = [
    "This worker supports mock generation only.",
    "Live image generation is disabled.",
    "IMAGE_GENERATION_WORKER_ENABLED",
    "IMAGE_WORKER_MONGODB_URI",
    "SUPABASE_SERVICE_ROLE_KEY is required",
    "Invalid image generation provider.",
    "Invalid live image rollout mode.",
    "Live image generation is unavailable.",
    "Image generation worker is disabled.",
    "Live image worker is not armed or approved.",
    "Mock worker refuses live-enabled configuration.",
    "Invalid image worker",
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
