import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export class IntegrationMongoConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationMongoConfigurationError";
  }
}

const INTEGRATION_DATABASE_NAME = "storm_facebook_integration_test";

export function getIntegrationMongoUri(): string {
  const envFilePath = resolve(process.cwd(), ".env.integration");

  let fileContents: string;

  try {
    fileContents = readFileSync(envFilePath, "utf8");
  } catch {
    throw new IntegrationMongoConfigurationError(
      "Integration test environment file was not found.",
    );
  }

  const uriLine = fileContents
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("MONGODB_INTEGRATION_TEST_URI="));

  if (!uriLine) {
    throw new IntegrationMongoConfigurationError(
      "MONGODB_INTEGRATION_TEST_URI is required.",
    );
  }

  const uri = uriLine.slice("MONGODB_INTEGRATION_TEST_URI=".length).trim();

  let parsedUri: URL;

  try {
    parsedUri = new URL(uri);
  } catch {
    throw new IntegrationMongoConfigurationError(
      "Invalid integration test MongoDB URI.",
    );
  }

  if (
    parsedUri.protocol !== "mongodb:" ||
    parsedUri.hostname !== "127.0.0.1" ||
    parsedUri.port !== "27017"
  ) {
    throw new IntegrationMongoConfigurationError(
      "Integration tests must use local MongoDB at 127.0.0.1:27017.",
    );
  }

  if (parsedUri.pathname !== `/${INTEGRATION_DATABASE_NAME}`) {
    throw new IntegrationMongoConfigurationError(
      "Integration tests must use the dedicated test database.",
    );
  }

  if (parsedUri.searchParams.get("replicaSet") !== "rs0") {
    throw new IntegrationMongoConfigurationError(
      "Integration tests require MongoDB replica set rs0.",
    );
  }

  if (parsedUri.username || parsedUri.password) {
    throw new IntegrationMongoConfigurationError(
      "This local integration test configuration does not support credentials.",
    );
  }

  if (
    parsedUri.searchParams.has("authSource") ||
    parsedUri.searchParams.has("directConnection")
  ) {
    throw new IntegrationMongoConfigurationError(
      "Unsupported integration test MongoDB connection options.",
    );
  }

  return uri;
}

export const INTEGRATION_MONGO_DATABASE_NAME = INTEGRATION_DATABASE_NAME;
