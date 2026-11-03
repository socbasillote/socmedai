import assert from "node:assert/strict";
import { beforeEach, after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  withScheduledPublishingHeartbeat,
  ScheduledLeaseLostError,
} from "../services/publishing/scheduledPublishingHeartbeat.js";

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Post from "../models/Post.js";
import { claimNextDuePost } from "../services/scheduledPostWorker.js";

import { recoverStalePublishingPosts } from "../services/scheduledPostWorker.js";
import {
  initializePlatformResults,
  claimPlatformResult,
  updatePlatformResult,
  PlatformResultServiceError,
} from "../services/publishing/platformResultService.js";

import {
  renewScheduledPublishingLease,
  SCHEDULED_LEASE_DURATION_MS,
} from "../services/publishing/scheduledPublishingLeaseService.js";

import {
  reconcilePostStatus,
  PostStatusReconciliationError,
} from "../services/publishing/postStatusReconciliationService.js";

let mongo: MongoMemoryServer;

beforeEach(async () => {
  await Post.deleteMany({});
});

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("scheduled post can only be claimed once", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Atomic Claim Safety Test",
    caption: "This must never be published externally.",
    platforms: ["facebook"],
    platformConnections: {
      facebook: new mongoose.Types.ObjectId(),
    },
    mediaIds: [],
    status: "scheduled",
    scheduledAt: new Date(now.getTime() - 60_000),
    attemptCount: 0,
  });

  // Simulate two workers claiming concurrently.
  const [first, second] = await Promise.all([
    claimNextDuePost(now),
    claimNextDuePost(now),
  ]);

  const claimed = [first, second].filter(Boolean);

  assert.equal(
    claimed.length,
    1,
    "Exactly one worker must claim the scheduled post.",
  );

  assert.equal(String(claimed[0]?._id), String(post._id));

  const persisted = await Post.findById(post._id).lean();

  assert.equal(persisted?.status, "publishing");
  assert.equal(persisted?.attemptCount, 1);

  // A third attempt must not claim the same post.
  const third = await claimNextDuePost(now);

  assert.equal(third, null);
});

test("previously attempted posts cannot be claimed again", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Duplicate Prevention Test",
    caption: "This post must not be claimed twice.",
    platforms: ["facebook"],
    platformConnections: {
      facebook: new mongoose.Types.ObjectId(),
    },
    mediaIds: [],
    status: "scheduled",
    scheduledAt: new Date(now.getTime() - 60_000),
    attemptCount: 1,
  });

  // The post looks scheduled, but it was previously attempted.
  const claimed = await claimNextDuePost(now);

  assert.equal(
    claimed,
    null,
    "A previously attempted post must not be claimed.",
  );

  const persisted = await Post.findById(post._id).lean();

  assert.equal(persisted?.status, "scheduled");
  assert.equal(persisted?.attemptCount, 1);
});

test("stale publishing claims are failed without automatic retry", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Stale Claim Recovery Test",
    caption: "This post must not be republished automatically.",
    platforms: ["facebook"],
    platformConnections: {
      facebook: new mongoose.Types.ObjectId(),
    },
    mediaIds: [],
    status: "publishing",
    scheduledAt: new Date(now.getTime() - 30 * 60_000),
    claimedAt: new Date(now.getTime() - 20 * 60_000),
    attemptCount: 1,
  });

  // Use a 15-minute stale claim timeout.
  const recovery = await recoverStalePublishingPosts(now, 15 * 60_000);

  assert.equal(recovery.modifiedCount, 1);

  const persisted = await Post.findById(post._id).lean();

  assert.equal(persisted?.status, "failed");
  assert.equal(persisted?.attemptCount, 1);

  assert.match(persisted?.lastError ?? "", /outcome is unknown/i);

  // Recovery must not make the post eligible for another claim.
  const claimed = await claimNextDuePost(now);

  assert.equal(claimed, null);
});

test("active publishing claims are not recovered before timeout", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),

    title: "Active Publishing Claim Test",
    caption: "This is an isolated worker safety test.",

    platforms: ["facebook"],

    platformConnections: {
      facebook: new mongoose.Types.ObjectId(),
    },

    mediaIds: [],
    status: "publishing",

    scheduledAt: new Date(now.getTime() - 10 * 60_000),

    // Claimed 2 minutes ago.
    claimedAt: new Date(now.getTime() - 2 * 60_000),

    attemptCount: 1,
  });

  // Recovery timeout: 15 minutes.
  const recovery = await recoverStalePublishingPosts(now, 15 * 60_000);

  assert.equal(
    recovery.modifiedCount,
    0,
    "An active claim must not be recovered before timeout.",
  );

  const persisted = await Post.findById(post._id).lean();

  assert.equal(persisted?.status, "publishing");
  assert.equal(persisted?.attemptCount, 1);
  assert.equal(persisted?.lastError ?? "", "");
});

test("publishing claims are recovered at the timeout boundary", async () => {
  const now = new Date();

  const timeoutMs = 15 * 60_000;

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),

    title: "Stale Claim Boundary Test",
    caption: "Testing the exact recovery timeout.",

    platforms: ["facebook"],

    platformConnections: {
      facebook: new mongoose.Types.ObjectId(),
    },

    mediaIds: [],
    status: "publishing",

    scheduledAt: new Date(now.getTime() - 30 * 60_000),

    // Exactly 15 minutes old.
    claimedAt: new Date(now.getTime() - timeoutMs),

    attemptCount: 1,
  });

  const recovery = await recoverStalePublishingPosts(now, timeoutMs);

  assert.equal(recovery.modifiedCount, 1);

  const persisted = await Post.findById(post._id).lean();

  assert.equal(persisted?.status, "failed");
  assert.equal(persisted?.attemptCount, 1);

  assert.match(persisted?.lastError ?? "", /outcome is unknown/i);

  // A recovered post must not be claimed again.
  const anotherClaim = await claimNextDuePost(now);

  assert.equal(anotherClaim, null);
});

test("a recovered post rejects late publishing results", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Late Publishing Result Safety Test",
    caption: "This post must not be republished.",
    platforms: ["facebook"],
    platformConnections: {
      facebook: new mongoose.Types.ObjectId(),
    },
    mediaIds: [],
    status: "publishing",
    scheduledAt: new Date(now.getTime() - 30 * 60_000),
    claimedAt: new Date(now.getTime() - 20 * 60_000),
    attemptCount: 1,
    platformResults: [
      {
        platform: "facebook",
        status: "publishing",
        attemptCount: 1,
      },
    ],
  });

  // Recover the expired claim.
  const recovery = await recoverStalePublishingPosts(now, 15 * 60_000);

  assert.equal(recovery.modifiedCount, 1);

  // Simulate a late result from the original worker.
  await assert.rejects(
    updatePlatformResult(String(post._id), {
      platform: "facebook",
      status: "published",
      externalPostId: "123456_789012",
      publishedAt: now,
      attemptCount: 1,
    }),
    (error: unknown) =>
      error instanceof PlatformResultServiceError && error.statusCode === 409,
  );

  // The recovered post must remain failed.
  const persisted = await Post.findById(post._id).lean();

  assert.equal(persisted?.status, "failed");
  assert.equal(persisted?.attemptCount, 1);

  assert.notEqual(persisted?.platformResults?.[0]?.status, "published");
});

test("scheduled claims receive ownership and lease metadata", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),

    title: "Scheduled Claim Ownership Test",
    caption: "Testing scheduled worker ownership.",

    platforms: ["facebook"],

    platformConnections: {
      facebook: new mongoose.Types.ObjectId(),
    },

    mediaIds: [],
    status: "scheduled",
    scheduledAt: new Date(now.getTime() - 60_000),
    attemptCount: 0,
  });

  // Atomically claim the test post.
  const claimed = await claimNextDuePost(now);

  assert.ok(claimed);

  assert.equal(String(claimed._id), String(post._id));

  assert.equal(claimed.status, "publishing");
  assert.equal(claimed.attemptCount, 1);

  // Verify ownership ID.
  assert.equal(typeof claimed.scheduledClaimId, "string");

  assert.match(
    claimed.scheduledClaimId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  // Verify lease expiration.
  assert.ok(claimed.scheduledLeaseExpiresAt instanceof Date);

  const expectedExpiration = now.getTime() + 15 * 60 * 1000;

  assert.equal(claimed.scheduledLeaseExpiresAt.getTime(), expectedExpiration);

  // Verify the ownership information was persisted.
  const persisted = await Post.findById(post._id)
    .select("+scheduledClaimId +scheduledLeaseExpiresAt")
    .lean();

  assert.ok(persisted);

  assert.equal(persisted.scheduledClaimId, claimed.scheduledClaimId);

  assert.equal(
    persisted.scheduledLeaseExpiresAt?.getTime(),
    expectedExpiration,
  );
});

test("active claim owner can renew scheduled publishing lease", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Lease Renewal Test",
    caption: "Testing active lease renewal.",
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

  const heartbeatTime = new Date(now.getTime() + 5 * 60_000);

  const renewed = await renewScheduledPublishingLease({
    postId: String(claimed._id),
    scheduledClaimId: claimed.scheduledClaimId!,
    now: heartbeatTime,
  });

  assert.equal(renewed, true);

  const persisted = await Post.findById(post._id)
    .select("+scheduledClaimId +scheduledLeaseExpiresAt")
    .lean();

  assert.ok(persisted);
  assert.equal(persisted.status, "publishing");
  assert.equal(persisted.attemptCount, 1);

  assert.equal(
    persisted.scheduledLeaseExpiresAt?.getTime(),
    heartbeatTime.getTime() + SCHEDULED_LEASE_DURATION_MS,
  );
});

test("incorrect claim ID cannot renew scheduled publishing lease", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Invalid Lease Owner Test",
    caption: "Testing claim ownership enforcement.",
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

  const originalExpiration = claimed.scheduledLeaseExpiresAt!.getTime();

  const renewed = await renewScheduledPublishingLease({
    postId: String(claimed._id),
    scheduledClaimId: "incorrect-claim-id",
    now: new Date(now.getTime() + 60_000),
  });

  assert.equal(renewed, false);

  const persisted = await Post.findById(post._id)
    .select("+scheduledLeaseExpiresAt")
    .lean();

  assert.equal(
    persisted?.scheduledLeaseExpiresAt?.getTime(),
    originalExpiration,
  );
});

test("expired scheduled publishing lease cannot be renewed", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Expired Lease Test",
    caption: "Testing expired claim rejection.",
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

  const expiration = claimed.scheduledLeaseExpiresAt!;

  // Exactly at expiry, the lease is no longer valid.
  const renewed = await renewScheduledPublishingLease({
    postId: String(claimed._id),
    scheduledClaimId: claimed.scheduledClaimId!,
    now: expiration,
  });

  assert.equal(renewed, false);

  const persisted = await Post.findById(post._id)
    .select("+scheduledLeaseExpiresAt")
    .lean();

  assert.equal(
    persisted?.scheduledLeaseExpiresAt?.getTime(),
    expiration.getTime(),
  );
});

test("renewed lease protects an old scheduled claim from recovery", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Renewed Lease Recovery Test",
    caption: "Testing lease-aware recovery.",
    platforms: ["facebook"],
    platformConnections: {
      facebook: new mongoose.Types.ObjectId(),
    },
    mediaIds: [],
    status: "scheduled",
    scheduledAt: new Date(now.getTime() - 30 * 60_000),
    attemptCount: 0,
  });

  // Simulate a claim made 20 minutes ago.
  const originalClaimTime = new Date(now.getTime() - 20 * 60_000);

  const claimed = await claimNextDuePost(originalClaimTime);

  assert.ok(claimed);

  // Renew the lease 10 minutes after the claim.
  const heartbeatTime = new Date(now.getTime() - 10 * 60_000);

  const renewed = await renewScheduledPublishingLease({
    postId: String(claimed._id),
    scheduledClaimId: claimed.scheduledClaimId!,
    now: heartbeatTime,
  });

  assert.equal(renewed, true);

  // The original claim is stale, but the lease is active.
  const recovery = await recoverStalePublishingPosts(now, 15 * 60_000);

  assert.equal(recovery.modifiedCount, 0);

  const persisted = await Post.findById(post._id)
    .select("+scheduledClaimId +scheduledLeaseExpiresAt")
    .lean();

  assert.ok(persisted);
  assert.equal(persisted.status, "publishing");
  assert.equal(persisted.attemptCount, 1);
  assert.equal(persisted.scheduledClaimId, claimed.scheduledClaimId);

  assert.ok(persisted.scheduledLeaseExpiresAt!.getTime() > now.getTime());
});

test("expired scheduled lease is recovered without retry", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Expired Scheduled Lease Recovery Test",
    caption: "Testing expired lease recovery.",
    platforms: ["facebook"],
    platformConnections: {
      facebook: new mongoose.Types.ObjectId(),
    },
    mediaIds: [],
    status: "scheduled",
    scheduledAt: new Date(now.getTime() - 30 * 60_000),
    attemptCount: 0,
  });

  const claimTime = new Date(now.getTime() - 20 * 60_000);

  const claimed = await claimNextDuePost(claimTime);

  assert.ok(claimed);

  // The 15-minute lease expired 5 minutes ago.
  assert.ok(claimed.scheduledLeaseExpiresAt!.getTime() < now.getTime());

  const recovery = await recoverStalePublishingPosts(now, 15 * 60_000);

  assert.equal(recovery.modifiedCount, 1);

  const persisted = await Post.findById(post._id)
    .select("+scheduledClaimId +scheduledLeaseExpiresAt")
    .lean();

  assert.ok(persisted);
  assert.equal(persisted.status, "failed");
  assert.equal(persisted.attemptCount, 1);

  assert.match(persisted.lastError ?? "", /outcome is unknown/i);

  // A recovered claim cannot be reclaimed automatically.
  const secondClaim = await claimNextDuePost(now);

  assert.equal(secondClaim, null);
});

test("incorrect scheduled claim cannot reconcile publication", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Incorrect Claim Reconciliation Test",
    caption: "Isolated reconciliation test.",
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

  // Simulate a confirmed platform result already saved
  // by the legitimate publishing attempt.
  await Post.updateOne(
    { _id: claimed._id, status: "publishing" },
    {
      $set: {
        platformResults: [
          {
            platform: "facebook",
            status: "published",
            externalPostId: "test_page_test_post",
            publishedAt: now,
            attemptCount: 1,
          },
        ],
      },
    },
  );

  await assert.rejects(
    reconcilePostStatus(String(post._id), {
      scheduledClaimId: "incorrect-claim-id",
    }),
    (error: unknown) =>
      error instanceof PostStatusReconciliationError &&
      error.statusCode === 409,
  );

  const persisted = await Post.findById(post._id).lean();

  assert.equal(persisted?.status, "publishing");
  assert.equal(persisted?.publishedAt ?? null, null);
});

test("valid scheduled claim can reconcile confirmed publication", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Valid Claim Reconciliation Test",
    caption: "Isolated reconciliation test.",
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

  await Post.updateOne(
    { _id: claimed._id, status: "publishing" },
    {
      $set: {
        platformResults: [
          {
            platform: "facebook",
            status: "published",
            externalPostId: "test_page_test_post",
            publishedAt: now,
            attemptCount: 1,
          },
        ],
      },
    },
  );

  const reconciled = await reconcilePostStatus(String(post._id), {
    scheduledClaimId: claimed.scheduledClaimId!,
  });

  assert.equal(reconciled.status, "published");

  const persisted = await Post.findById(post._id).lean();

  assert.equal(persisted?.status, "published");

  assert.ok(persisted?.publishedAt instanceof Date);

  assert.equal(persisted.publishedAt.getTime(), now.getTime());
});

test("scheduled publishing cannot omit claim ownership", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Missing Claim Context Test",
    caption: "Testing scheduled claim enforcement.",
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

  const postId = String(claimed._id);

  // Context-free initialization must be rejected.
  await assert.rejects(
    initializePlatformResults(postId, ["facebook"]),
    (error: unknown) =>
      error instanceof PlatformResultServiceError && error.statusCode === 404,
  );

  // Prepare a pending result without using the service.
  await Post.updateOne(
    { _id: post._id },
    {
      $set: {
        platformResults: [
          {
            platform: "facebook",
            status: "pending",
            attemptCount: 0,
          },
        ],
      },
    },
  );

  // Context-free platform claiming must not succeed.
  const result = await claimPlatformResult(postId, "facebook");

  assert.equal(result, null);

  // Prepare a publishing result to test the update guard.
  await Post.updateOne(
    { _id: post._id },
    {
      $set: {
        platformResults: [
          {
            platform: "facebook",
            status: "publishing",
            attemptCount: 1,
          },
        ],
      },
    },
  );

  await assert.rejects(
    updatePlatformResult(postId, {
      platform: "facebook",
      status: "published",
      externalPostId: "test_page_test_post",
      publishedAt: now,
      attemptCount: 1,
    }),
    (error: unknown) =>
      error instanceof PlatformResultServiceError && error.statusCode === 409,
  );

  await assert.rejects(
    reconcilePostStatus(postId),
    (error: unknown) =>
      error instanceof PostStatusReconciliationError &&
      error.statusCode === 409,
  );

  const persisted = await Post.findById(postId).lean();

  assert.equal(persisted?.status, "publishing");
  assert.equal(persisted?.platformResults?.[0]?.status, "publishing");
});

test("immediate publishing can use context-free result operations", async () => {
  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Immediate Publishing Compatibility Test",
    caption: "Testing immediate publishing compatibility.",
    platforms: ["facebook"],
    platformConnections: {
      facebook: new mongoose.Types.ObjectId(),
    },
    mediaIds: [],
    status: "publishing",
    claimedAt: new Date(),
    attemptCount: 1,
  });

  const postId = String(post._id);

  await initializePlatformResults(postId, ["facebook"]);

  const claimed = await claimPlatformResult(postId, "facebook");

  assert.ok(claimed);

  await updatePlatformResult(postId, {
    platform: "facebook",
    status: "published",
    externalPostId: "test_page_test_post",
    publishedAt: new Date(),
    attemptCount: claimed.attemptCount,
  });

  const reconciled = await reconcilePostStatus(postId);

  assert.equal(reconciled.status, "published");

  const persisted = await Post.findById(postId).lean();

  assert.equal(persisted?.status, "published");
  assert.equal(persisted?.platformResults?.[0]?.status, "published");
});

test("heartbeat renews the lease while dispatch is running", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Heartbeat Integration Test",
    caption: "Testing heartbeat without external publication.",
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

  const initialExpiration = claimed.scheduledLeaseExpiresAt!.getTime();

  let operationExecuted = false;

  await withScheduledPublishingHeartbeat(
    {
      postId: String(claimed._id),
      scheduledClaimId: claimed.scheduledClaimId!,
      intervalMs: 20, // Short interval for this test only.
    },
    async () => {
      operationExecuted = true;

      // Simulate an operation without contacting Meta.
      await delay(150);
    },
  );

  assert.equal(operationExecuted, true);

  const persisted = await Post.findById(post._id)
    .select("+scheduledLeaseExpiresAt")
    .lean();

  assert.ok(persisted);

  assert.ok(
    persisted.scheduledLeaseExpiresAt!.getTime() > initialExpiration,
    "Heartbeat should extend the original lease.",
  );

  assert.equal(persisted.status, "publishing");
  assert.equal(persisted.attemptCount, 1);
});

test("heartbeat refuses dispatch when the lease has expired", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Expired Heartbeat Ownership",
    caption: "No external publication should occur.",
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

  // Expire the lease using a controlled database update.
  await Post.updateOne(
    { _id: post._id },
    {
      $set: {
        scheduledLeaseExpiresAt: new Date(now.getTime() - 1000),
      },
    },
  );

  let dispatchCalls = 0;

  await assert.rejects(
    withScheduledPublishingHeartbeat(
      {
        postId: String(post._id),
        scheduledClaimId: claimed.scheduledClaimId!,
        intervalMs: 20,
      },
      async () => {
        dispatchCalls += 1;
      },
    ),
    /missing or expired/i,
  );

  assert.equal(dispatchCalls, 0);

  const persisted = await Post.findById(post._id).lean();

  assert.equal(persisted?.status, "publishing");
  assert.equal(persisted?.attemptCount, 1);
});

test("heartbeat ownership loss never starts another dispatch", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Heartbeat Ownership Loss",
    caption: "Testing ownership loss during dispatch.",
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

  let dispatchCalls = 0;

  await withScheduledPublishingHeartbeat(
    {
      postId: String(post._id),
      scheduledClaimId: claimed.scheduledClaimId!,
      intervalMs: 20,
    },
    async () => {
      dispatchCalls += 1;

      // Simulate another operation superseding ownership.
      await Post.updateOne(
        { _id: post._id },
        {
          $set: {
            scheduledClaimId: "superseded-claim",
          },
        },
      );

      // Allow heartbeat attempts to observe the mismatch.
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
    },
  );

  assert.equal(dispatchCalls, 1);

  const persisted = await Post.findById(post._id)
    .select("+scheduledClaimId")
    .lean();

  assert.equal(persisted?.scheduledClaimId, "superseded-claim");
  assert.equal(persisted?.attemptCount, 1);
});

test("heartbeat stops after publishing operation throws", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Heartbeat Cleanup Test",
    caption: "Testing heartbeat cleanup.",
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

  await assert.rejects(
    withScheduledPublishingHeartbeat(
      {
        postId: String(post._id),
        scheduledClaimId: claimed.scheduledClaimId!,
        intervalMs: 20,
      },
      async () => {
        throw new Error("Simulated dispatcher failure");
      },
    ),
    /Simulated dispatcher failure/,
  );

  const afterFailure = await Post.findById(post._id)
    .select("+scheduledLeaseExpiresAt")
    .lean();

  assert.ok(afterFailure);

  const expirationAfterFailure =
    afterFailure.scheduledLeaseExpiresAt!.getTime();

  // Wait longer than several heartbeat intervals.
  await new Promise<void>((resolve) => setTimeout(resolve, 150));

  const afterCleanup = await Post.findById(post._id)
    .select("+scheduledLeaseExpiresAt")
    .lean();

  assert.equal(
    afterCleanup?.scheduledLeaseExpiresAt?.getTime(),
    expirationAfterFailure,
    "Lease must not continue renewing after operation failure.",
  );
});

test("heartbeat signals ownership loss to the active operation", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Lease Loss Signal Test",
    caption: "Isolated ownership-loss verification.",
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

  let operationStarted = false;
  let externalOperationStarted = false;

  await withScheduledPublishingHeartbeat(
    {
      postId: String(claimed._id),
      scheduledClaimId: claimed.scheduledClaimId!,
      intervalMs: 20,
    },
    async (lease) => {
      operationStarted = true;

      // Simulate loss of claim ownership.
      await Post.updateOne(
        { _id: claimed._id },
        {
          $set: {
            scheduledClaimId: "different-owner",
          },
        },
      );

      // Allow a heartbeat to discover the mismatch.
      await new Promise<void>((resolve, reject) => {
        let elapsed = 0;

        const check = setInterval(() => {
          elapsed += 10;

          if (lease.ownershipLost) {
            clearInterval(check);
            resolve();
          } else if (elapsed >= 2000) {
            clearInterval(check);
            reject(new Error("Lease loss was not signaled."));
          }
        }, 10);
      });

      assert.equal(lease.ownershipLost, true);
      assert.equal(lease.lossReason, "ownership-rejected");

      // A cooperative dispatcher checks ownership before
      // initiating another external operation.
      assert.throws(() => lease.assertOwnership(), ScheduledLeaseLostError);

      // This must never be reached.
      lease.assertOwnership();
      externalOperationStarted = true;
    },
  ).catch((error: unknown) => {
    assert.ok(error instanceof ScheduledLeaseLostError);
  });

  assert.equal(operationStarted, true);
  assert.equal(externalOperationStarted, false);
});

test("healthy heartbeat signal permits an active operation", async () => {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Healthy Lease Signal Test",
    caption: "Checking valid ownership signaling.",
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

  let operationStarted = false;

  await withScheduledPublishingHeartbeat(
    {
      postId: String(claimed._id),
      scheduledClaimId: claimed.scheduledClaimId!,
      intervalMs: 20,
    },
    async (lease) => {
      lease.assertOwnership();

      assert.equal(lease.ownershipLost, false);
      assert.equal(lease.lossReason, null);

      operationStarted = true;
    },
  );

  assert.equal(operationStarted, true);
});
