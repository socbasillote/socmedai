import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generatePlatformCaptionsSchema,
  platformCaptionsResponseSchema,
} from "../schemas/aiContentSchema.js";

const validInput = {
  brief: "Announce our productivity application for small businesses.",
  tone: "professional",
  audience: "Small business owners",
  callToAction: "Learn more",
  length: "medium",
};

const validResponse = {
  captions: {
    facebook:
      "🚀 Organize your workday with our productivity app. What helps you stay focused?",
    linkedin:
      "We're introducing a productivity application designed to help small businesses organize daily tasks.",
  },
};

test("accepts valid multi-platform generation input", () => {
  const result = generatePlatformCaptionsSchema.safeParse(validInput);

  assert.equal(result.success, true);
});

test("rejects missing campaign brief", () => {
  const { brief: _brief, ...invalidInput } = validInput;

  const result = generatePlatformCaptionsSchema.safeParse(invalidInput);

  assert.equal(result.success, false);
});

test("rejects unsupported input fields", () => {
  const result = generatePlatformCaptionsSchema.safeParse({
    ...validInput,
    automaticPublish: true,
  });

  assert.equal(result.success, false);
});

test("accepts distinct Facebook and LinkedIn captions", () => {
  const result = platformCaptionsResponseSchema.safeParse(validResponse);

  assert.equal(result.success, true);
});

test("rejects a missing LinkedIn caption", () => {
  const result = platformCaptionsResponseSchema.safeParse({
    captions: {
      facebook: "Facebook caption",
    },
  });

  assert.equal(result.success, false);
});

test("rejects identical platform captions", () => {
  const result = platformCaptionsResponseSchema.safeParse({
    captions: {
      facebook: "Our new product is here!",
      linkedin: "  OUR NEW PRODUCT IS HERE!  ",
    },
  });

  assert.equal(result.success, false);
});

test("rejects empty captions", () => {
  const result = platformCaptionsResponseSchema.safeParse({
    captions: {
      facebook: "   ",
      linkedin: "A valid LinkedIn caption.",
    },
  });

  assert.equal(result.success, false);
});

test("rejects unsupported response platforms", () => {
  const result = platformCaptionsResponseSchema.safeParse({
    captions: {
      ...validResponse.captions,
      instagram: "Instagram caption",
    },
  });

  assert.equal(result.success, false);
});
