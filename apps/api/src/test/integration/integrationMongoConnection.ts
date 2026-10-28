import mongoose, { type Connection } from "mongoose";

import {
  getIntegrationMongoUri,
  INTEGRATION_MONGO_DATABASE_NAME,
} from "./integrationMongoConfig.js";

export class IntegrationMongoConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationMongoConnectionError";
  }
}

export type IntegrationMongoConnection = Connection;

/**
 * Opens a separate MongoDB connection exclusively for
 * Facebook integration tests.
 *
 * This must never reuse mongoose.connection because
 * that connection belongs to the running Storm API.
 */
export async function connectIntegrationMongo(): Promise<Connection> {
  const uri = getIntegrationMongoUri();

  const connection = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    maxPoolSize: 5,
    autoIndex: true,
  });

  try {
    await connection.asPromise();

    // Verify the actual connected database.
    if (connection.db?.databaseName !== INTEGRATION_MONGO_DATABASE_NAME) {
      throw new IntegrationMongoConnectionError(
        "Connected to an unexpected MongoDB database.",
      );
    }

    // Confirm replica-set membership and primary status.
    const hello = await connection.db.admin().command({
      hello: 1,
    });

    if (hello.setName !== "rs0") {
      throw new IntegrationMongoConnectionError(
        "Integration MongoDB must belong to replica set rs0.",
      );
    }

    if (hello.isWritablePrimary !== true) {
      throw new IntegrationMongoConnectionError(
        "Integration MongoDB must be a writable replica-set primary.",
      );
    }

    return connection;
  } catch (error) {
    // Always close failed connections.
    await connection.close().catch(() => undefined);

    if (error instanceof IntegrationMongoConnectionError) {
      throw error;
    }

    throw new IntegrationMongoConnectionError(
      "Could not connect to the integration test MongoDB replica set.",
    );
  }
}

/**
 * Safely closes the dedicated integration-test connection.
 *
 * Never disconnect the application's default Mongoose connection
 * from an integration test.
 */
export async function disconnectIntegrationMongo(
  connection: Connection,
): Promise<void> {
  if (!connection) {
    return;
  }

  await connection.close();
}
