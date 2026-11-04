import assert from "node:assert/strict";
import { test } from "node:test";

import type { NextFunction, Request, Response } from "express";

import request from "supertest";

// Set test defaults before dynamically importing app
// and its environment configuration.
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SCHEDULED_PUBLISHING_ENABLED = "false";

const { app } = await import("../app.js");

const { generatePlatformCaptionsController } =
  await import("../controllers/aiContentController.js");

const endpoint = "/api/ai/generate-platform-captions";

const validInput = {
  brief: "Introduce a productivity app for small businesses.",
  tone: "professional",
  audience: "Small business owners",
  callToAction: "Learn more",
  length: "medium",
};

/**
 * The real Express route is exercised for
 * unauthenticated requests.
 *
 * Controller-level tests below validate bad
 * authenticated-body handling without needing
 * to generate or expose a real Supabase token.
 */

test("rejects anonymous requests with HTTP 401", async () => {
  const response = await request(app).post(endpoint).send(validInput);

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Unauthorized");
});

test("rejects anonymous requests before body validation", async () => {
  const response = await request(app).post(endpoint).send({});

  assert.equal(response.status, 401);
});

/**
 * Calls the real controller directly with a
 * small Express response double.
 *
 * This tests validation and error response shape,
 * but does not replace a full authenticated-route
 * integration test.
 */
async function invokeInvalidBody(body: unknown) {
  let statusCode = 200;
  let responseBody: unknown;
  let nextError: unknown;

  const req = {
    body,
  } as Request;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      responseBody = value;
      return this;
    },
  } as unknown as Response;

  const next: NextFunction = (error?: unknown) => {
    nextError = error;
  };

  await generatePlatformCaptionsController(req, res, next);

  assert.equal(
    nextError,
    undefined,
    "Invalid input must not reach the error handler.",
  );

  assert.equal(statusCode, 400);

  assert.ok(responseBody !== null && typeof responseBody === "object");

  const result = responseBody as {
    error?: string;
    message?: string;
  };

  assert.equal(result.error, "Validation failed");

  assert.equal(typeof result.message, "string");

  assert.ok(result.message?.length);
}

test("rejects an empty campaign brief", async () => {
  await invokeInvalidBody({
    ...validInput,
    brief: "",
  });
});

test("rejects an unsupported writing tone", async () => {
  await invokeInvalidBody({
    ...validInput,
    tone: "unsupported-tone",
  });
});

test("rejects unexpected request fields", async () => {
  await invokeInvalidBody({
    ...validInput,
    automaticPublish: true,
  });
});

test("rejects a missing required campaign brief", async () => {
  const { brief: _brief, ...invalidInput } = validInput;

  await invokeInvalidBody(invalidInput);
});
