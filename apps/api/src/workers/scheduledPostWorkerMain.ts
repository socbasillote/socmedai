import { env } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import {
  startScheduledPostWorker,
  stopScheduledPostWorker,
} from "../services/scheduledPostWorkerRunner.js";

async function main(): Promise<void> {
  if (env.SCHEDULED_PUBLISHING_ENABLED !== "true") {
    throw new Error("SCHEDULED_PUBLISHING_ENABLED must be true for this worker.");
  }
  // Do not silently deploy a persistent worker against the localhost default.
  if (!process.env.MONGODB_URI?.trim()) {
    throw new Error("MONGODB_URI is required for the scheduled worker.");
  }

  let stopping = false;
  let connecting: Promise<void> | undefined;
  let shutdownPromise: Promise<void> | undefined;

  function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    shutdownPromise = (async () => {
      await connecting?.catch(() => undefined);
      try {
        // Stop claiming and await dispatch/heartbeats before closing MongoDB.
        await stopScheduledPostWorker();
      } finally {
        await disconnectDatabase();
      }
      console.info("[Storm Scheduled Worker] Stopped.");
    })();
    return shutdownPromise;
  }

  const onSignal = () => {
    void shutdown().catch(() => {
      console.error("[Storm Scheduled Worker] Shutdown failed.");
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    connecting = connectDatabase();
    await connecting;
    if (stopping) { await shutdown(); return; }
    startScheduledPostWorker();
    console.info("[Storm Scheduled Worker] Ready; scheduled publishing enabled.");
  } catch (error) {
    await shutdown();
    throw error;
  }
}

void main().catch((error: unknown) => {
  // Driver errors can contain credentials or connection strings.
  const message = error instanceof Error ? error.message : "";
  const safeMessage = message.startsWith("SCHEDULED_PUBLISHING_ENABLED must") ||
    message.startsWith("MONGODB_URI is required")
    ? message : `Startup failed: ${error instanceof Error ? error.name : "UnknownError"}`;
  console.error("[Storm Scheduled Worker]", safeMessage);
  process.exitCode = 1;
});
