import mongoose from "mongoose";

import { env } from "./env.js";

let connectionPromise: Promise<void> | undefined;

export function connectDatabase(): Promise<void> {
  if (isDatabaseConnected()) return Promise.resolve();
  if (connectionPromise) return connectionPromise;

  mongoose.set("strictQuery", true);

  connectionPromise = mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  }).then(() => {
    console.info("Connected to MongoDB.");
  }).finally(() => {
    // A failed connection must be retryable on the next invocation.
    connectionPromise = undefined;
  });
  return connectionPromise;
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.info("Disconnected from MongoDB.");
}
