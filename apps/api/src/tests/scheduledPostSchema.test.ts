import assert from "node:assert/strict";
import { test } from "node:test";

import { createPostSchema } from "../schemas/postSchema.js";

const workspaceId = "507f1f77bcf86cd799439011";
const facebookId = "507f191e810c19729de860ea";
const linkedinId = "507f1f77bcf86cd799439012";
const mediaId = "507f1f77bcf86cd799439013";

function futureDate(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function validFacebookSchedule() {
  return {
    workspaceId,
    caption: "Scheduled Facebook test post.",
    platforms: ["facebook"],
    platformConnections: {
      facebook: facebookId,
    },
    mediaIds: [],
    scheduledAt: futureDate(),
  };
}

function validLinkedInSchedule() {
  return {
    workspaceId,
    caption: "Scheduled LinkedIn test post.",
    platforms: ["linkedin"],
    platformConnections: {
      linkedin: linkedinId,
    },
    mediaIds: [],
    scheduledAt: futureDate(),
  };
}

function expectRejected(input: unknown, expectedPath: string): void {
  const result = createPostSchema.safeParse(input);

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.ok(
    result.error.issues.some((issue) => issue.path.join(".") === expectedPath),
    `Expected validation error at ${expectedPath}. Got: ${JSON.stringify(result.error.issues)}`,
  );
}

test("valid scheduled Facebook request is accepted", () => {
  const result = createPostSchema.safeParse(validFacebookSchedule());

  assert.equal(result.success, true);
});

test("valid scheduled LinkedIn request is accepted", () => {
  const result = createPostSchema.safeParse(validLinkedInSchedule());

  assert.equal(result.success, true);
});

test("scheduled Facebook requires a selected Page", () => {
  expectRejected(
    {
      ...validFacebookSchedule(),
      platformConnections: {},
    },
    "platformConnections.facebook",
  );
});

test("scheduled LinkedIn requires a selected account", () => {
  expectRejected(
    {
      ...validLinkedInSchedule(),
      platformConnections: {},
    },
    "platformConnections.linkedin",
  );
});

test("scheduled publishing rejects multiple platforms", () => {
  expectRejected(
    {
      ...validFacebookSchedule(),
      platforms: ["facebook", "linkedin"],
    },
    "platforms",
  );
});

test("scheduled publishing rejects unsupported Instagram", () => {
  expectRejected(
    {
      ...validFacebookSchedule(),
      platforms: ["instagram"],
      platformConnections: {},
    },
    "platforms",
  );
});

test("scheduled publishing rejects past dates", () => {
  expectRejected(
    {
      ...validFacebookSchedule(),
      scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    },
    "scheduledAt",
  );
});

test("scheduled publishing rejects invalid dates", () => {
  expectRejected(
    {
      ...validFacebookSchedule(),
      scheduledAt: "not-a-date",
    },
    "scheduledAt",
  );
});

test("scheduled publishing rejects empty captions", () => {
  expectRejected(
    {
      ...validFacebookSchedule(),
      caption: "   ",
    },
    "caption",
  );
});

test("scheduled publishing rejects media attachments", () => {
  expectRejected(
    {
      ...validFacebookSchedule(),
      mediaIds: [mediaId],
    },
    "mediaIds",
  );
});

test("draft creation still allows no selected connection", () => {
  const result = createPostSchema.safeParse({
    workspaceId,
    caption: "Draft without a selected account.",
    platforms: ["facebook"],
    mediaIds: [],
  });

  assert.equal(result.success, true);
});

test("Facebook connection cannot be assigned to LinkedIn-only post", () => {
  expectRejected(
    {
      ...validLinkedInSchedule(),
      platformConnections: {
        linkedin: linkedinId,
        facebook: facebookId,
      },
    },
    "platformConnections.facebook",
  );
});
