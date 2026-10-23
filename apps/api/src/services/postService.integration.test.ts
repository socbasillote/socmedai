import mongoose from "mongoose";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { env } from "../config/env.js";
import Post from "../models/Post.js";

const TEST_DATABASE_NAME = "storm_post_draft_concurrency_integration_test";

const integrationEnabled = process.env.RUN_MONGODB_INTEGRATION_TESTS === "true";

describe.skipIf(!integrationEnabled)(
  "postService MongoDB draft concurrency integration",
  () => {
    let postId: mongoose.Types.ObjectId;
    let workspaceId: mongoose.Types.ObjectId;
    let createdByUserId: mongoose.Types.ObjectId;

    beforeAll(async () => {
      await mongoose.connect(env.MONGODB_URI, {
        dbName: TEST_DATABASE_NAME,
        serverSelectionTimeoutMS: 5000,
      });

      if (mongoose.connection.name !== TEST_DATABASE_NAME) {
        throw new Error(
          "Integration tests must use the dedicated test database.",
        );
      }

      await mongoose.connection.dropDatabase();
    });

    afterAll(async () => {
      if (mongoose.connection.readyState === 1) {
        if (mongoose.connection.name === TEST_DATABASE_NAME) {
          await mongoose.connection.dropDatabase();
        }

        await mongoose.disconnect();
      }
    });

    beforeEach(async () => {
      await Post.deleteMany({});

      workspaceId = new mongoose.Types.ObjectId();
      createdByUserId = new mongoose.Types.ObjectId();

      const post = await Post.create({
        workspaceId,
        createdByUserId,
        caption: "Original caption",
        platforms: ["linkedin"],
        platformConnections: {
          linkedin: new mongoose.Types.ObjectId(),
        },
        status: "draft",
      });

      postId = post._id;
    });

    function draftFilter(version: number) {
      return {
        _id: postId,
        workspaceId,
        createdByUserId,
        status: "draft",
        __v: version,
      };
    }

    it("allows only one of two concurrent edits using the same version", async () => {
      const original = await Post.findById(postId).lean();

      expect(original).not.toBeNull();

      const version = original!.__v;

      const [first, second] = await Promise.all([
        Post.findOneAndUpdate(
          draftFilter(version),
          {
            $set: {
              caption: "Caption A",
            },
            $inc: {
              __v: 1,
            },
          },
          {
            new: true,
            runValidators: true,
          },
        ),

        Post.findOneAndUpdate(
          draftFilter(version),
          {
            $set: {
              caption: "Caption B",
            },
            $inc: {
              __v: 1,
            },
          },
          {
            new: true,
            runValidators: true,
          },
        ),
      ]);

      const successes = [first, second].filter(Boolean);
      const conflicts = [first, second].filter((result) => result === null);

      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(1);

      const persisted = await Post.findById(postId).lean();

      expect(persisted).not.toBeNull();
      expect(persisted!.__v).toBe(version + 1);

      expect(["Caption A", "Caption B"]).toContain(persisted!.caption);
    });

    it("prevents a stale account update after LinkedIn is removed", async () => {
      const original = await Post.findById(postId).lean();

      expect(original).not.toBeNull();

      const version = original!.__v;

      const removeLinkedIn = await Post.findOneAndUpdate(
        draftFilter(version),
        {
          $set: {
            platforms: ["facebook"],
          },
          $unset: {
            "platformConnections.linkedin": "",
          },
          $inc: {
            __v: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      );

      expect(removeLinkedIn).not.toBeNull();

      const staleAccountUpdate = await Post.findOneAndUpdate(
        draftFilter(version),
        {
          $set: {
            "platformConnections.linkedin": new mongoose.Types.ObjectId(),
          },
          $inc: {
            __v: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      );

      expect(staleAccountUpdate).toBeNull();

      const persisted = await Post.findById(postId).lean();

      expect(persisted).not.toBeNull();
      expect(persisted!.platforms).toEqual(["facebook"]);

      expect(persisted!.platformConnections?.linkedin).toBeUndefined();

      expect(persisted!.__v).toBe(version + 1);
    });

    it("rejects a draft edit after the post becomes scheduled", async () => {
      const original = await Post.findById(postId).lean();

      expect(original).not.toBeNull();

      const version = original!.__v;

      await Post.updateOne(
        {
          _id: postId,
          status: "draft",
        },
        {
          $set: {
            status: "scheduled",
            scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      );

      const staleEdit = await Post.findOneAndUpdate(
        draftFilter(version),
        {
          $set: {
            caption: "Should not be saved",
          },
          $inc: {
            __v: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      );

      expect(staleEdit).toBeNull();

      const persisted = await Post.findById(postId).lean();

      expect(persisted?.status).toBe("scheduled");
      expect(persisted?.caption).toBe("Original caption");
    });

    it("rejects a draft edit after the post is deleted", async () => {
      const original = await Post.findById(postId).lean();

      expect(original).not.toBeNull();

      const version = original!.__v;

      await Post.deleteOne({
        _id: postId,
        workspaceId,
        createdByUserId,
        status: "draft",
      });

      const staleEdit = await Post.findOneAndUpdate(
        draftFilter(version),
        {
          $set: {
            caption: "Should not be saved",
          },
          $inc: {
            __v: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      );

      expect(staleEdit).toBeNull();

      const persisted = await Post.findById(postId).lean();

      expect(persisted).toBeNull();
    });
  },
);
