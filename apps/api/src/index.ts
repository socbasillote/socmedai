import { createServer } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";

import { connectDatabase, disconnectDatabase } from "./config/database.js";

import {
  startScheduledPostWorker,
  stopScheduledPostWorker,
} from "./services/scheduledPostWorkerRunner.js";

const server = createServer(app);

let shuttingDown = false;

/**
 * Starts MongoDB, the scheduled worker, and HTTP.
 *
 * A shutdown request received during startup prevents
 * the worker and HTTP server from starting unnecessarily.
 */
async function startServer(): Promise<void> {
  try {
    await connectDatabase();

    if (shuttingDown) {
      return;
    }

    startScheduledPostWorker();

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("error", onError);
        reject(error);
      };

      server.once("error", onError);

      server.listen(env.API_PORT, () => {
        server.off("error", onError);

        console.info(`Storm API listening on http://localhost:${env.API_PORT}`);

        console.info(`Environment: ${env.NODE_ENV}`);

        resolve();
      });
    });
  } catch (error) {
    console.error("Failed to start Storm API:", error);

    process.exitCode = 1;

    // Keep MongoDB available until any worker activity ends.
    try {
      await stopScheduledPostWorker();
    } catch (workerError) {
      console.error(
        "Failed to stop scheduled worker after startup error:",
        workerError,
      );
    }

    if (!shuttingDown) {
      try {
        await disconnectDatabase();
      } catch (disconnectError) {
        console.error(
          "Failed to disconnect MongoDB after startup error:",
          disconnectError,
        );
      }
    }
  }
}

const startupPromise = startServer();

/**
 * Stops HTTP intake and the worker, then disconnects
 * MongoDB only after both have settled.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.info(`${signal} received. Shutting down Storm API...`);

  // Wait for startup to settle before closing the server.
  await startupPromise;

  // Initiate HTTP shutdown immediately rather than waiting
  // for a potentially long scheduled publication.
  const httpShutdown = new Promise<void>((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }

    try {
      server.close((error) => {
        if (error) {
          console.error("Error closing HTTP server:", error);

          process.exitCode = 1;
        }

        resolve();
      });
    } catch (error) {
      console.error("Unable to initiate HTTP shutdown:", error);

      process.exitCode = 1;
      resolve();
    }
  });

  try {
    await stopScheduledPostWorker();
  } catch (error) {
    console.error("Error stopping scheduled worker:", error);

    process.exitCode = 1;
  }

  // Existing HTTP requests may still be completing.
  await httpShutdown;

  try {
    await disconnectDatabase();
  } catch (error) {
    console.error("Error disconnecting MongoDB:", error);

    process.exitCode = 1;
  }

  console.info("Storm API shutdown complete.");
}

process.on("SIGINT", () => {
  void shutdown("SIGINT").catch((error) => {
    console.error("Unexpected shutdown error:", error);
    process.exitCode = 1;
  });
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM").catch((error) => {
    console.error("Unexpected shutdown error:", error);
    process.exitCode = 1;
  });
});
