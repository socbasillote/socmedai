import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Post from "../models/Post.js";

import { claimNextDuePost } from "../services/scheduledPostWorker.js";

import {
  dispatchScheduledPost,
  ScheduledPublishingError,
} from "../services/publishing/scheduledPublishingDispatcher.js";

import { ScheduledLeaseSignal } from "../services/publishing/scheduledPublishingHeartbeat.js";

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

test("dispatcher records an identity failure before external publishing", async () => {
  const now = new Date();

  // Deliberately reference a user profile that does
  // not exist in the isolated MongoDB database.
  const missingCreatorId = new mongoose.Types.ObjectId();

  const post = await Post.create({
    workspaceId: new mongoose.Types.ObjectId(),
    createdByUserId: missingCreatorId,

    title: "Dispatcher Pre-Activation Safety",
    caption: "This must never reach Facebook.",

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

  const lease = new ScheduledLeaseSignal();

  // Identity resolution must fail before the
  // dispatcher constructs the Facebook adapter.
  await assert.rejects(
    dispatchScheduledPost(String(post._id), lease),
    (error: unknown) => error instanceof ScheduledPublishingError,
  );

  const persisted = await Post.findById(post._id).lean();

  assert.ok(persisted);

  assert.equal(persisted.status, "failed");
  assert.equal(persisted.attemptCount, 1);

  assert.match(
    persisted.lastError ?? "",
    /scheduled publishing could not be prepared safely/i,
  );

  // The failed post must never be automatically reclaimed.
  const anotherClaim = await claimNextDuePost(new Date());

  assert.equal(anotherClaim, null);
});
