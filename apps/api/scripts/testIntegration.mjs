import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

// Always use a disposable database, regardless of the application's configured URI.
const mongo = await MongoMemoryServer.create();
try {
  const child = spawn(process.execPath, [
    fileURLToPath(new URL("../../../node_modules/vitest/vitest.mjs", import.meta.url)),
    "run",
    "src/services/postService.integration.test.ts",
    "src/services/postService.service.integration.test.ts",
    "src/services/publishing/facebookImmediatePublishingExecutionService.integration.test.ts",
    "src/services/publishing/facebookImmediatePublishingService.integration.test.ts",
    "src/services/publishing/immediatePublishingService.integration.test.ts",
    "src/services/publishing/platformResultService.integration.test.ts",
    "src/services/publishing/postStatusReconciliationService.integration.test.ts",
    ...process.argv.slice(2),
  ], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      MONGODB_URI: mongo.getUri(),
      RUN_MONGODB_INTEGRATION_TESTS: "true",
      FACEBOOK_PUBLISHING_ENABLED: "true",
      SCHEDULED_PUBLISHING_ENABLED: "true",
    },
    stdio: "inherit",
    windowsHide: true,
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await mongo.stop();
}
