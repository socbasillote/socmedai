import mongoose from "mongoose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { env } from "../../config/env.js";
import Post from "../../models/Post.js";
import {
  PostStatusReconciliationError,
  reconcilePostStatus,
} from "./postStatusReconciliationService.js";

const TEST_DATABASE_NAME = "storm_post_status_reconciliation_integration_test";

const integrationEnabled = process.env.RUN_MONGODB_INTEGRATION_TESTS === "true";

describe.skipIf(!integrationEnabled)(
  "postStatusReconciliationService MongoDB integration",
  () => {
    let postId: mongoose.Types.ObjectId;

    beforeAll(async () => {
      await mongoose.connect(env.MONGODB_URI, {
        dbName: TEST_DATABASE_NAME,
        serverSelectionTimeoutMS: 5000,
      });

      // This dedicated database is reserved exclusively for these tests.
      await mongoose.connection.dropDatabase();
    });

    afterAll(async () => {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      }
    });

    beforeEach(async () => {
      await Post.deleteMany({});

      const post = await Post.create({
        workspaceId: new mongoose.Types.ObjectId(),
        createdByUserId: new mongoose.Types.ObjectId(),
        caption: "Reconciliation integration test",
        platforms: ["facebook", "instagram"],
        status: "publishing",
        platformResults: [
          {
            platform: "facebook",
            status: "published",
            externalPostId: "facebook-integration-123",
            publishedAt: new Date("2026-10-19T01:00:00.000Z"),
            attemptCount: 1,
          },
          {
            platform: "instagram",
            status: "published",
            externalPostId: "instagram-integration-456",
            publishedAt: new Date("2026-10-19T02:00:00.000Z"),
            attemptCount: 1,
          },
        ],
      });

      postId = post._id;
    });

    it("persists published status when every selected platform is published", async () => {
      const result = await reconcilePostStatus(postId.toString());

      expect(result.status).toBe("published");
      expect(result.publishedAt).toEqual(new Date("2026-10-19T02:00:00.000Z"));

      const persisted = await Post.findById(postId).lean();

      expect(persisted?.status).toBe("published");
      expect(persisted?.publishedAt).toEqual(
        new Date("2026-10-19T02:00:00.000Z"),
      );
    });

    it("persists failed status for mixed confirmed publication and failure", async () => {
      await Post.updateOne(
        { _id: postId },
        {
          $set: {
            "platformResults.1.status": "failed",
            "platformResults.1.lastError": "Platform rejected the post.",
          },
        },
      );

      await reconcilePostStatus(postId.toString());

      const persisted = await Post.findById(postId).lean();

      expect(persisted?.status).toBe("failed");
      expect(persisted?.publishedAt).toBeUndefined();

      expect(
        persisted?.platformResults.find(
          (result: { platform: string; status: string }) =>
            result.platform === "facebook",
        )?.status,
      ).toBe("published");
    });

    it("preserves publishing status when a platform outcome is unknown", async () => {
      await Post.updateOne(
        { _id: postId },
        {
          $set: {
            "platformResults.1.status": "unknown",
            "platformResults.1.lastError": "External outcome is uncertain.",
          },
        },
      );

      await reconcilePostStatus(postId.toString());

      const persisted = await Post.findById(postId).lean();

      expect(persisted?.status).toBe("publishing");
      expect(persisted?.publishedAt).toBeUndefined();
    });

    it("preserves a newer platform result that exists before reconciliation", async () => {
      await Post.updateOne(
        { _id: postId },
        {
          $set: {
            "platformResults.1.status": "unknown",
            "platformResults.1.lastError": "Concurrent update",
          },
        },
      );

      await reconcilePostStatus(postId.toString());

      const persisted = await Post.findById(postId).lean();

      expect(persisted?.status).toBe("publishing");
      expect(persisted?.platformResults[1]?.status).toBe("unknown");
      expect(persisted?.platformResults[1]?.lastError).toBe(
        "Concurrent update",
      );
    });

    it("rejects a missing post", async () => {
      await Post.deleteOne({ _id: postId });

      await expect(
        reconcilePostStatus(postId.toString()),
      ).rejects.toBeInstanceOf(PostStatusReconciliationError);
    });
  },
);
