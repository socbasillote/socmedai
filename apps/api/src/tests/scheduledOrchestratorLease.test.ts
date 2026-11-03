import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Post from "../models/Post.js";
import {
  claimNextDuePost,
  recoverStalePublishingPosts,
} from "../services/scheduledPostWorker.js";

import { PublishingOrchestrator } from "../services/publishing/publishingOrchestrator.js";

import type { PublishingAdapter } from "../services/publishing/publishingAdapter.js";

import {
  ScheduledLeaseSignal,
  ScheduledLeaseLostError,
} from "../services/publishing/scheduledPublishingHeartbeat.js";

let mongo: MongoMemoryServer;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  await Post.deleteMany({});
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

async function createClaimedScheduledPost() {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Fake Adapter Scheduled Test",
    caption: "This is not a real Facebook post.",
    platforms: ["facebook"],
    platformConnections: {
      facebook: new mongoose.Types.ObjectId(),
    },
    mediaIds: [],
    status: "scheduled",
    scheduledAt: new Date(now.getTime() - 60_000),
    attemptCount: 0,
  });

  const claimed = await claimNextDuePost(now);

  assert.ok(claimed);
  assert.equal(String(claimed._id), String(post._id));
  assert.ok(claimed.scheduledClaimId);

  return {
    post,
    claimed,
    postId: String(post._id),
    claimContext: {
      scheduledClaimId: claimed.scheduledClaimId,
    },
  };
}

test("valid scheduled ownership permits fake adapter publication", async () => {
  const { post, claimed, postId, claimContext } =
    await createClaimedScheduledPost();

  let adapterCalls = 0;
  const now = new Date();

  const fakeAdapter: PublishingAdapter = {
    async publish(input) {
      adapterCalls += 1;

      assert.equal(input.postId, postId);
      assert.equal(input.platform, "facebook");

      return {
        outcome: "published",
        postId: input.postId,
        platform: input.platform,
        externalPostId: "fake_page_fake_post",
        publishedAt: now,
      };
    },
  };

  const orchestrator = new PublishingOrchestrator(fakeAdapter);

  const lease = new ScheduledLeaseSignal();

  const result = await orchestrator.processPost(
    {
      ...claimed,
      _id: String(claimed._id),
      workspaceId: String(claimed.workspaceId),
    },
    claimContext,
    lease,
  );

  assert.equal(adapterCalls, 1);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].outcome, "published");

  const persisted = await Post.findById(post._id).lean();

  assert.equal(persisted?.status, "published");
  assert.equal(persisted?.platformResults?.[0]?.status, "published");
  assert.equal(
    persisted?.platformResults?.[0]?.externalPostId,
    "fake_page_fake_post",
  );
});

test("lost lease prevents fake adapter from starting", async () => {
  const { post, claimed, claimContext } = await createClaimedScheduledPost();

  let adapterCalls = 0;

  const fakeAdapter: PublishingAdapter = {
    async publish(input) {
      adapterCalls += 1;

      return {
        outcome: "published",
        postId: input.postId,
        platform: input.platform,
        externalPostId: "must_not_exist",
        publishedAt: new Date(),
      };
    },
  };

  const lease = new ScheduledLeaseSignal();

  // Simulate ownership loss before orchestration.
  lease.markLost("ownership-rejected");

  const orchestrator = new PublishingOrchestrator(fakeAdapter);

  await assert.rejects(
    orchestrator.processPost(
      {
        ...claimed,
        _id: String(claimed._id),
        workspaceId: String(claimed.workspaceId),
      },
      claimContext,
      lease,
    ),
    ScheduledLeaseLostError,
  );

  assert.equal(adapterCalls, 0);

  const persisted = await Post.findById(post._id).lean();

  assert.equal(persisted?.status, "publishing");
  assert.notEqual(persisted?.platformResults?.[0]?.status, "published");
});

test("lease loss during adapter execution prevents result persistence", async () => {
  const { post, claimed, claimContext } = await createClaimedScheduledPost();

  let adapterCalls = 0;

  const lease = new ScheduledLeaseSignal();

  const fakeAdapter: PublishingAdapter = {
    async publish(input) {
      adapterCalls += 1;

      // Simulate lease loss after the external operation
      // has already been initiated.
      lease.markLost("ownership-rejected");

      return {
        outcome: "published",
        postId: input.postId,
        platform: input.platform,
        externalPostId: "fake_external_success",
        publishedAt: new Date(),
      };
    },
  };

  const orchestrator = new PublishingOrchestrator(fakeAdapter);

  await assert.rejects(
    orchestrator.processPost(
      {
        ...claimed,
        _id: String(claimed._id),
        workspaceId: String(claimed.workspaceId),
      },
      claimContext,
      lease,
    ),
    ScheduledLeaseLostError,
  );

  assert.equal(adapterCalls, 1);

  const persisted = await Post.findById(post._id).lean();

  // The post cannot be finalized by a worker
  // after it has observed ownership loss.
  assert.equal(persisted?.status, "publishing");

  assert.notEqual(persisted?.platformResults?.[0]?.status, "published");

  assert.equal(persisted?.attemptCount, 1);
});

test("confirmed external success with expired lease is not automatically retried", async () => {
  const { post, claimed, postId, claimContext } =
    await createClaimedScheduledPost();

  let adapterCalls = 0;
  const externalPostId = "fake_confirmed_external_post";

  const fakeAdapter: PublishingAdapter = {
    async publish(input) {
      adapterCalls += 1;

      // Simulate successful publication on Facebook.
      const publishedAt = new Date();

      // Simulate lease expiration before the result can
      // be persisted to MongoDB.
      await Post.updateOne(
        { _id: post._id },
        {
          $set: {
            scheduledLeaseExpiresAt: new Date(Date.now() - 1000),
          },
        },
      );

      return {
        outcome: "published",
        postId: input.postId,
        platform: input.platform,
        externalPostId,
        publishedAt,
      };
    },
  };

  const orchestrator = new PublishingOrchestrator(fakeAdapter);

  const lease = new ScheduledLeaseSignal();

  await assert.rejects(
    orchestrator.processPost(
      {
        ...claimed,
        _id: postId,
        workspaceId: String(claimed.workspaceId),
      },
      claimContext,
      lease,
    ),
  );

  assert.equal(adapterCalls, 1);

  // Publishing may have succeeded externally.
  // However, the expired worker must not finalize
  // the database record without ownership.
  const afterFailure = await Post.findById(post._id).lean();

  assert.equal(afterFailure?.status, "publishing");
  assert.equal(afterFailure?.attemptCount, 1);

  assert.notEqual(afterFailure?.platformResults?.[0]?.status, "published");

  // The lease-aware recovery process should eventually
  // move the unresolved claim to failed.
  const recovery = await recoverStalePublishingPosts(new Date(), 15 * 60_000);

  assert.equal(recovery.modifiedCount, 1);

  const recovered = await Post.findById(post._id).lean();

  assert.equal(recovered?.status, "failed");
  assert.equal(recovered?.attemptCount, 1);

  assert.match(recovered?.lastError ?? "", /outcome is unknown/i);

  // Do not requeue the post.
  const anotherClaim = await claimNextDuePost(new Date());

  assert.equal(anotherClaim, null);
});
