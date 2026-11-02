import {
  connectIntegrationMongo,
  disconnectIntegrationMongo,
} from "./integrationMongoConnection.js";

async function main(): Promise<void> {
  console.log("Checking Storm integration MongoDB connection...");

  const connection = await connectIntegrationMongo();

  try {
    console.log("MongoDB connection: OK");

    console.log("Database:", connection.db?.databaseName);

    const hello = await connection.db!.admin().command({
      hello: 1,
    });

    console.log("Replica set:", hello.setName);

    console.log("Writable primary:", hello.isWritablePrimary === true);

    console.log("Integration MongoDB verification passed.");
  } finally {
    await disconnectIntegrationMongo(connection);
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Integration MongoDB verification failed.",
  );

  process.exitCode = 1;
});
