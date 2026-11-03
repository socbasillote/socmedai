import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Post from "../models/Post.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import FacebookConnection from "../models/FacebookConnection.js";

import {
  createWorkspacePost,
  PostServiceError,
} from "../services/postService.js";

import { createPostSchema } from "../schemas/postSchema.js";

import LinkedInConnection from "../models/LinkedInConnection.js";

let mongo: MongoMemoryServer;

const authUser = {
  id: "scheduled-creation-test-user",
  email: "scheduled-test@example.com",
};

let workspaceId: mongoose.Types.ObjectId;
let facebookConnectionId: mongoose.Types.ObjectId;
let linkedinConnectionId: mongoose.Types.ObjectId;

function futureDate(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function validFacebookInput() {
  return createPostSchema.parse({
    workspaceId: String(workspaceId),
    title: "Scheduled Facebook Integration Test",
    caption: "This is an isolated scheduled test.",
    platforms: ["facebook"],
    platformConnections: {
      facebook: String(facebookConnectionId),
    },
    mediaIds: [],
    scheduledAt: futureDate(),
  });
}

function validLinkedInInput() {
  return createPostSchema.parse({
    workspaceId: String(workspaceId),
    title: "Scheduled LinkedIn Integration Test",
    caption: "This is an isolated LinkedIn scheduled test.",
    platforms: ["linkedin"],
    platformConnections: {
      linkedin: String(linkedinConnectionId),
    },
    mediaIds: [],
    scheduledAt: futureDate(),
  });
}

async function expectServiceError(
  operation: () => Promise<unknown>,
  expectedStatus: number,
): Promise<void> {
  await assert.rejects(
    operation(),
    (error: unknown) =>
      error instanceof PostServiceError && error.statusCode === expectedStatus,
  );
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  await Promise.all([
    Post.deleteMany({}),
    UserProfile.deleteMany({}),
    Workspace.deleteMany({}),
    FacebookConnection.deleteMany({}),
    LinkedInConnection.deleteMany({}),
  ]);

  const profileId = new mongoose.Types.ObjectId();
  workspaceId = new mongoose.Types.ObjectId();
  facebookConnectionId = new mongoose.Types.ObjectId();
  linkedinConnectionId = new mongoose.Types.ObjectId();

  // Minimal fixtures for the real authorization queries.
  // Native insertion intentionally bypasses unrelated
  // account onboarding schema requirements.
  await UserProfile.collection.insertOne({
    _id: profileId,
    supabaseUserId: authUser.id,
    email: authUser.email,
  });

  await Workspace.collection.insertOne({
    _id: workspaceId,
    ownerUserId: profileId,
  });

  await FacebookConnection.collection.insertOne({
    _id: facebookConnectionId,
    workspaceId,
    status: "connected",
    tasks: ["CREATE_CONTENT"],
  });

  await LinkedInConnection.collection.insertOne({
    _id: linkedinConnectionId,
    workspaceId,
    status: "connected",
    scopes: ["w_member_social"],
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test("valid scheduled Facebook post is persisted", async () => {
  const result = await createWorkspacePost(authUser, validFacebookInput());

  const persisted = await Post.findById(result._id).lean();

  assert.ok(persisted);

  assert.equal(persisted.status, "scheduled");
  assert.equal(persisted.attemptCount, 0);
  assert.equal(persisted.platforms.length, 1);
  assert.equal(persisted.platforms[0], "facebook");

  assert.equal(
    String(persisted.platformConnections?.facebook),
    String(facebookConnectionId),
  );

  assert.ok(persisted.scheduledAt instanceof Date);
  assert.ok(persisted.scheduledAt.getTime() > Date.now());

  assert.deepEqual(persisted.mediaIds, []);
  assert.deepEqual(persisted.platformResults, []);
});

test("scheduled Facebook post requires a selected Page", async () => {
  const input = validFacebookInput();

  await expectServiceError(
    () =>
      createWorkspacePost(authUser, {
        ...input,
        platformConnections: {},
      }),
    400,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("scheduled Facebook rejects a Page from another workspace", async () => {
  await FacebookConnection.collection.updateOne(
    { _id: facebookConnectionId },
    {
      $set: {
        workspaceId: new mongoose.Types.ObjectId(),
      },
    },
  );

  await expectServiceError(
    () => createWorkspacePost(authUser, validFacebookInput()),
    404,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("scheduled Facebook rejects an inactive Page", async () => {
  await FacebookConnection.collection.updateOne(
    { _id: facebookConnectionId },
    {
      $set: {
        status: "disconnected",
      },
    },
  );

  await expectServiceError(
    () => createWorkspacePost(authUser, validFacebookInput()),
    409,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("scheduled Facebook requires CREATE_CONTENT permission", async () => {
  await FacebookConnection.collection.updateOne(
    { _id: facebookConnectionId },
    {
      $set: {
        tasks: [],
      },
    },
  );

  await expectServiceError(
    () => createWorkspacePost(authUser, validFacebookInput()),
    403,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("scheduled post rejects a past scheduled date", async () => {
  const input = validFacebookInput();

  // Call the service directly to test its independent
  // validation, bypassing the HTTP Zod middleware.
  await expectServiceError(
    () =>
      createWorkspacePost(authUser, {
        ...input,
        scheduledAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    400,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("scheduled post rejects unsupported Instagram", async () => {
  const input = validFacebookInput();

  await expectServiceError(
    () =>
      createWorkspacePost(authUser, {
        ...input,
        platforms: ["instagram"],
        platformConnections: {},
      }),
    400,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("unauthorized workspace cannot create scheduled posts", async () => {
  await Workspace.collection.updateOne(
    { _id: workspaceId },
    {
      $set: {
        ownerUserId: new mongoose.Types.ObjectId(),
      },
    },
  );

  await expectServiceError(
    () => createWorkspacePost(authUser, validFacebookInput()),
    404,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("draft creation remains compatible without a connection", async () => {
  const input = createPostSchema.parse({
    workspaceId: String(workspaceId),
    title: "Unconnected Facebook Draft",
    caption: "This draft can be completed later.",
    platforms: ["facebook"],
    mediaIds: [],
  });

  const created = await createWorkspacePost(authUser, input);

  const persisted = await Post.findById(created._id).lean();

  assert.ok(persisted);

  assert.equal(persisted.status, "draft");
  assert.equal(persisted.attemptCount, 0);
  assert.equal(persisted.scheduledAt ?? null, null);

  assert.equal(persisted.platformConnections?.facebook ?? null, null);
});

test("scheduled LinkedIn post requires a selected account", async () => {
  const input = validFacebookInput();

  await expectServiceError(
    () =>
      createWorkspacePost(authUser, {
        ...input,
        platforms: ["linkedin"],
        platformConnections: {},
      }),
    400,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("scheduled publishing rejects multiple destinations", async () => {
  const input = validFacebookInput();

  await expectServiceError(
    () =>
      createWorkspacePost(authUser, {
        ...input,
        platforms: ["facebook", "linkedin"],
      }),
    400,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("scheduled publishing rejects whitespace-only captions", async () => {
  const input = validFacebookInput();

  await expectServiceError(
    () =>
      createWorkspacePost(authUser, {
        ...input,
        caption: "   ",
      }),
    400,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("scheduled publishing rejects media attachments until supported", async () => {
  const input = validFacebookInput();

  await expectServiceError(
    () =>
      createWorkspacePost(authUser, {
        ...input,
        mediaIds: [String(new mongoose.Types.ObjectId())],
      }),
    400,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("valid scheduled LinkedIn post is persisted", async () => {
  const created = await createWorkspacePost(authUser, validLinkedInInput());

  const persisted = await Post.findById(created._id).lean();

  assert.ok(persisted);

  assert.equal(persisted.status, "scheduled");
  assert.equal(persisted.attemptCount, 0);

  assert.deepEqual(persisted.platforms, ["linkedin"]);

  assert.equal(
    String(persisted.platformConnections?.linkedin),
    String(linkedinConnectionId),
  );

  assert.equal(persisted.platformConnections?.facebook ?? null, null);

  assert.ok(persisted.scheduledAt instanceof Date);
  assert.ok(persisted.scheduledAt.getTime() > Date.now());

  assert.deepEqual(persisted.mediaIds, []);
  assert.deepEqual(persisted.platformResults, []);
});

test("scheduled LinkedIn rejects a connection from another workspace", async () => {
  await LinkedInConnection.collection.updateOne(
    { _id: linkedinConnectionId },
    {
      $set: {
        workspaceId: new mongoose.Types.ObjectId(),
      },
    },
  );

  await expectServiceError(
    () => createWorkspacePost(authUser, validLinkedInInput()),
    404,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("scheduled LinkedIn rejects a disconnected account", async () => {
  await LinkedInConnection.collection.updateOne(
    { _id: linkedinConnectionId },
    {
      $set: {
        status: "disconnected",
      },
    },
  );

  await expectServiceError(
    () => createWorkspacePost(authUser, validLinkedInInput()),
    409,
  );

  assert.equal(await Post.countDocuments({}), 0);
});

test("scheduled LinkedIn requires w_member_social permission", async () => {
  await LinkedInConnection.collection.updateOne(
    { _id: linkedinConnectionId },
    {
      $set: {
        scopes: [],
      },
    },
  );

  await expectServiceError(
    () => createWorkspacePost(authUser, validLinkedInInput()),
    403,
  );

  assert.equal(await Post.countDocuments({}), 0);
});
