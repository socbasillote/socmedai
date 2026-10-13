import { createServer } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";

const server = createServer(app);

async function startServer(): Promise<void> {
  try {
    await connectDatabase();

    server.listen(env.API_PORT, () => {
      console.info(`Storm API listening on http://localhost:${env.API_PORT}`);
      console.info(`Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    console.error("Failed to start Storm API:", error);
    await disconnectDatabase().catch(() => undefined);
    process.exitCode = 1;
  }
}

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  console.info(`${signal} received. Shutting down Storm API...`);

  server.close(async (error) => {
    if (error) {
      console.error("Error closing HTTP server:", error);
      process.exitCode = 1;
    }

    try {
      await disconnectDatabase();
    } catch (disconnectError) {
      console.error("Error disconnecting MongoDB:", disconnectError);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

void startServer();
