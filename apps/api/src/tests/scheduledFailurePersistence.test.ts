import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Post from "../models/Post.js";
import { claimNextDuePost } from "../services/scheduledPostWorker.js";

import {
  recordScheduledPreDispatchFailure,
  recordScheduledInterruptedPublishing,
} from "../services/publishing/scheduledPublishingFailureService.js";

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

async function createClaim() {
  const now = new Date();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    title: "Failure Persistence Safety Test",
    caption: "No real external publication.",
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
  assert.ok(claimed.scheduledClaimId);

  return {
    postId: String(post._id),
    scheduledClaimId: claimed.scheduledClaimId,
  };
}

test("valid owner can record a definite pre-dispatch failure", async () => {
  const ownership = await createClaim();

  const recorded = await recordScheduledPreDispatchFailure(
    ownership,
    "Workspace authorization failed before publishing.",
  );

  assert.equal(recorded, true);

  const persisted = await Post.findById(ownership.postId).lean();

  assert.equal(persisted?.status, "failed");
  assert.equal(persisted?.attemptCount, 1);
  assert.match(persisted?.lastError ?? "", /authorization failed/i);
});

test("superseded owner cannot overwrite a publishing attempt", async () => {
  const ownership = await createClaim();

  await Post.updateOne(
    { _id: ownership.postId },
    {
      $set: {
        scheduledClaimId: "replacement-owner",
        lastError: "Newer owner information.",
      },
    },
  );

  const preDispatchRecorded = await recordScheduledPreDispatchFailure(
    ownership,
    "Old worker failure.",
  );

  const interruptedRecorded =
    await recordScheduledInterruptedPublishing(ownership);

  assert.equal(preDispatchRecorded, false);
  assert.equal(interruptedRecorded, false);

  const persisted = await Post.findById(ownership.postId).lean();

  assert.equal(persisted?.status, "publishing");
  assert.equal(persisted?.lastError, "Newer owner information.");
  assert.equal(persisted?.attemptCount, 1);
});

test("expired owner cannot overwrite an uncertain outcome", async () => {
  const ownership = await createClaim();

  await Post.updateOne(
    { _id: ownership.postId },
    {
      $set: {
        scheduledLeaseExpiresAt: new Date(Date.now() - 1000),
        lastError: "External result requires investigation.",
      },
    },
  );

  const recorded = await recordScheduledInterruptedPublishing(ownership);

  assert.equal(recorded, false);

  const persisted = await Post.findById(ownership.postId).lean();

  assert.equal(persisted?.status, "publishing");
  assert.equal(persisted?.lastError, "External result requires investigation.");
  assert.equal(persisted?.attemptCount, 1);
});
