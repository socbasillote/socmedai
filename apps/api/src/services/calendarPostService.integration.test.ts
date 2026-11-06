import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import Post from "../models/Post.js";

import { findAuthorizedCalendarPosts } from "./calendarPostService.js";

const workspaceA = new mongoose.Types.ObjectId();

const workspaceB = new mongoose.Types.ObjectId();

const creatorId = new mongoose.Types.ObjectId();

const range = {
  start: "2026-11-01T00:00:00.000Z",
  end: "2026-12-01T00:00:00.000Z",
};

let mongo: MongoMemoryServer;

type TestPostInput = {
  workspaceId?: mongoose.Types.ObjectId;
  status?: "draft" | "scheduled" | "publishing" | "published" | "failed";
  scheduledAt?: string;
  publishedAt?: string;
  title?: string;
};

async function insertPost({
  workspaceId = workspaceA,
  status = "scheduled",
  scheduledAt,
  publishedAt,
  title = "Test post",
}: TestPostInput = {}) {
  return Post.create({
    workspaceId,
    createdByUserId: creatorId,
    title,
    caption: "Calendar integration test.",
    mediaIds: [],
    platforms: ["facebook"],
    status,
    ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}),
    ...(publishedAt ? { publishedAt: new Date(publishedAt) } : {}),
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();

  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  await Post.deleteMany({});
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (mongo) {
    await mongo.stop();
  }
});

describe("calendar query MongoDB integration", () => {
  it("includes a scheduled post exactly at start", async () => {
    const post = await insertPost({
      title: "At start",
      scheduledAt: range.start,
    });

    const result = await findAuthorizedCalendarPosts(String(workspaceA), range);

    expect(result.posts.map((item) => String(item._id))).toContain(
      String(post._id),
    );
  });

  it("includes a post immediately before end", async () => {
    const post = await insertPost({
      title: "Before end",
      scheduledAt: "2026-11-30T23:59:59.999Z",
    });

    const result = await findAuthorizedCalendarPosts(String(workspaceA), range);

    expect(result.posts.map((item) => String(item._id))).toContain(
      String(post._id),
    );
  });

  it("excludes a post exactly at end", async () => {
    const post = await insertPost({
      title: "At end",
      scheduledAt: range.end,
    });

    const result = await findAuthorizedCalendarPosts(String(workspaceA), range);

    expect(result.posts.map((item) => String(item._id))).not.toContain(
      String(post._id),
    );
  });

  it("excludes posts before start", async () => {
    await insertPost({
      scheduledAt: "2026-10-31T23:59:59.999Z",
    });

    const result = await findAuthorizedCalendarPosts(String(workspaceA), range);

    expect(result.posts).toHaveLength(0);
  });

  it("excludes posts from another workspace", async () => {
    await insertPost({
      workspaceId: workspaceB,
      scheduledAt: "2026-11-10T01:00:00.000Z",
    });

    const result = await findAuthorizedCalendarPosts(String(workspaceA), range);

    expect(result.posts).toHaveLength(0);
  });

  it("uses publishedAt for published posts", async () => {
    const post = await insertPost({
      status: "published",
      scheduledAt: "2026-10-15T09:00:00.000Z",
      publishedAt: "2026-11-10T01:00:00.000Z",
    });

    const result = await findAuthorizedCalendarPosts(String(workspaceA), range);

    expect(result.posts.map((item) => String(item._id))).toContain(
      String(post._id),
    );
  });

  it("excludes published posts outside range", async () => {
    await insertPost({
      status: "published",
      scheduledAt: "2026-11-10T01:00:00.000Z",
      publishedAt: "2026-12-01T00:00:00.000Z",
    });

    const result = await findAuthorizedCalendarPosts(String(workspaceA), range);

    expect(result.posts).toHaveLength(0);
  });

  it("includes failed posts with scheduledAt", async () => {
    await insertPost({
      status: "failed",
      scheduledAt: "2026-11-10T01:00:00.000Z",
    });

    const result = await findAuthorizedCalendarPosts(String(workspaceA), range);

    expect(result.posts).toHaveLength(1);
  });

  it("excludes unscheduled drafts", async () => {
    await insertPost({
      status: "draft",
    });

    const result = await findAuthorizedCalendarPosts(String(workspaceA), range);

    expect(result.posts).toHaveLength(0);
  });

  it("does not return duplicate posts", async () => {
    await insertPost({
      status: "published",
      scheduledAt: "2026-11-10T01:00:00.000Z",
      publishedAt: "2026-11-10T02:00:00.000Z",
    });

    const result = await findAuthorizedCalendarPosts(String(workspaceA), range);

    expect(result.posts).toHaveLength(1);
  });
});
