import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { env } from "../../config/env.js";
import Post from "../../models/Post.js";
import {
  claimPlatformResult,
  initializePlatformResults,
  PlatformResultServiceError,
  updatePlatformResult,
} from "./platformResultService.js";

const TEST_DATABASE_NAME = "storm_platform_result_integration_test";

type TestPlatformResult = {
  platform: string;
  status: string;
  attemptCount: number;
  lastError?: string;
  externalPostId?: string;
  publishedAt?: Date;
};

const integrationEnabled = process.env.RUN_MONGODB_INTEGRATION_TESTS === "true";

describe.skipIf(!integrationEnabled)(
  "platformResultService MongoDB integration",
  () => {
    let postId: mongoose.Types.ObjectId;

    beforeAll(async () => {
      await mongoose.connect(env.MONGODB_URI, {
        dbName: TEST_DATABASE_NAME,
        serverSelectionTimeoutMS: 5000,
      });

      // This database is reserved exclusively for these integration tests.
      await mongoose.connection.dropDatabase();
    });

    afterAll(async () => {
      if (mongoose.connection.readyState === 1) {
        // Clean up only the dedicated integration-test database.
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      }
    });

    beforeEach(async () => {
      await Post.deleteMany({});

      const post = await Post.create({
        workspaceId: new mongoose.Types.ObjectId(),
        createdByUserId: new mongoose.Types.ObjectId(),
        caption: "Integration test post",
        platforms: ["facebook", "instagram"],
        status: "draft",
      });

      postId = post._id;
    });

    it("initializes one result per requested platform", async () => {
      const post = await initializePlatformResults(postId.toString(), [
        "facebook",
        "instagram",
      ]);

      const results = post.platformResults as TestPlatformResult[];

      expect(
        results.map((result) => ({
          platform: result.platform,
          status: result.status,
          attemptCount: result.attemptCount,
        })),
      ).toEqual([
        {
          platform: "facebook",
          status: "pending",
          attemptCount: 0,
        },
        {
          platform: "instagram",
          status: "pending",
          attemptCount: 0,
        },
      ]);
    });

    it("does not duplicate results when initialized repeatedly", async () => {
      await initializePlatformResults(postId.toString(), [
        "facebook",
        "instagram",
      ]);

      const post = await initializePlatformResults(postId.toString(), [
        "facebook",
        "instagram",
      ]);

      const results = post.platformResults as TestPlatformResult[];

      expect(results).toHaveLength(2);
      expect(results.map((result) => result.platform).sort()).toEqual([
        "facebook",
        "instagram",
      ]);
    });

    it("preserves existing results when adding a platform", async () => {
      await initializePlatformResults(postId.toString(), ["facebook"]);

      await Post.updateOne(
        { _id: postId },
        {
          $set: {
            "platformResults.0.status": "failed",
            "platformResults.0.lastError": "Test failure",
          },
        },
      );

      const post = await initializePlatformResults(postId.toString(), [
        "facebook",
        "linkedin",
      ]);

      const results = post.platformResults as TestPlatformResult[];

      expect(post.platformResults).toHaveLength(2);

      expect(
        results.find((result) => result.platform === "facebook"),
      ).toMatchObject({
        platform: "facebook",
        status: "failed",
        lastError: "Test failure",
      });

      expect(
        results.find((result) => result.platform === "linkedin"),
      ).toMatchObject({
        platform: "linkedin",
        status: "pending",
        attemptCount: 0,
      });
    });

    it("persists confirmed publication details for one platform", async () => {
      await initializePlatformResults(postId.toString(), [
        "facebook",
        "instagram",
      ]);
      await updatePlatformResult(postId.toString(), {
        platform: "facebook",
        status: "publishing",
        attemptCount: 1,
      });

      const publishedAt = new Date("2026-10-19T08:30:00.000Z");

      const post = await updatePlatformResult(postId.toString(), {
        platform: "facebook",
        status: "published",
        externalPostId: "integration-external-123",
        publishedAt,
        attemptCount: 2,
      });

      const results = post.platformResults as TestPlatformResult[];

      expect(
        results.find((result) => result.platform === "facebook"),
      ).toMatchObject({
        platform: "facebook",
        status: "published",
        externalPostId: "integration-external-123",
        attemptCount: 2,
        publishedAt,
      });

      expect(
        results.find((result) => result.platform === "instagram"),
      ).toMatchObject({
        platform: "instagram",
        status: "pending",
        attemptCount: 0,
      });

      const persistedPost = await Post.findById(postId).lean();

      expect(persistedPost).not.toBeNull();

      const persistedResults = persistedPost!
        .platformResults as TestPlatformResult[];

      expect(
        persistedResults.find((result) => result.platform === "facebook"),
      ).toMatchObject({
        status: "published",
        externalPostId: "integration-external-123",
        attemptCount: 2,
        publishedAt,
      });
    });

    it("rejects unconfirmed publication without modifying stored results", async () => {
      await initializePlatformResults(postId.toString(), ["facebook"]);

      await expect(
        updatePlatformResult(postId.toString(), {
          platform: "facebook",
          status: "published",
        }),
      ).rejects.toThrow(
        "Confirmed publication requires an external post ID and a valid publication timestamp.",
      );

      const post = await Post.findById(postId).lean();
      expect(post).not.toBeNull();

      const results = post!.platformResults as TestPlatformResult[];

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        platform: "facebook",
        status: "pending",
        attemptCount: 0,
      });
    });

    it("rejects updates for platforms that have not been initialized", async () => {
      await initializePlatformResults(postId.toString(), ["facebook"]);

      await expect(
        updatePlatformResult(postId.toString(), {
          platform: "instagram",
          status: "pending",
        }),
      ).rejects.toMatchObject({
        name: "PlatformResultServiceError",
        statusCode: 409,
      });

      const post = await Post.findById(postId).lean();
      expect(post).not.toBeNull();

      const results = post!.platformResults as TestPlatformResult[];

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        platform: "facebook",
        status: "pending",
        attemptCount: 0,
      });
    });
    it("atomically claims a pending platform and increments its attempt count", async () => {
      await initializePlatformResults(postId.toString(), ["facebook"]);

      const claim = await claimPlatformResult(postId.toString(), "facebook");

      expect(claim).not.toBeNull();
      expect(claim!.attemptCount).toBe(1);

      const claimedResult = (
        claim!.post.platformResults as TestPlatformResult[]
      ).find((result) => result.platform === "facebook");

      expect(claimedResult).toMatchObject({
        platform: "facebook",
        status: "publishing",
        attemptCount: 1,
        lastError: "",
      });

      const persistedPost = await Post.findById(postId).lean();
      expect(persistedPost).not.toBeNull();

      const persistedResult = (
        persistedPost!.platformResults as TestPlatformResult[]
      ).find((result) => result.platform === "facebook");

      expect(persistedResult).toMatchObject({
        status: "publishing",
        attemptCount: 1,
      });
    });

    it("allows only one of two concurrent claims for the same platform", async () => {
      await initializePlatformResults(postId.toString(), ["facebook"]);

      const claims = await Promise.all([
        claimPlatformResult(postId.toString(), "facebook"),
        claimPlatformResult(postId.toString(), "facebook"),
      ]);

      expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
      expect(claims.filter((claim) => claim === null)).toHaveLength(1);

      const persistedPost = await Post.findById(postId).lean();
      expect(persistedPost).not.toBeNull();

      const results = persistedPost!.platformResults as TestPlatformResult[];

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        platform: "facebook",
        status: "publishing",
        attemptCount: 1,
      });
    });
  },
);
