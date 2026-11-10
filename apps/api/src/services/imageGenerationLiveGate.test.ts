import { describe, expect, it } from "vitest";

import {
  assertLiveImageAllowed,
  evaluateLiveImageGate,
  parseLiveImageGateConfig,
} from "./imageGenerationLiveGate.js";

const WORKSPACE_A = "507f1f77bcf86cd799439011";

const WORKSPACE_B = "507f1f77bcf86cd799439012";

function configured(overrides: Record<string, string> = {}) {
  return parseLiveImageGateConfig({
    IMAGE_GENERATION_PROVIDER: "openai",
    IMAGE_GENERATION_LIVE_ENABLED: "true",
    IMAGE_GENERATION_LIVE_WORKER_ENABLED: "true",
    IMAGE_GENERATION_LIVE_ROLLOUT: "internal",
    IMAGE_GENERATION_MODEL: "gpt-image-2",
    IMAGE_GENERATION_LIVE_WORKSPACE_ALLOWLIST: WORKSPACE_A,
    IMAGE_GENERATION_LIVE_MAX_ACTIVE: "1",
    IMAGE_GENERATION_LIVE_DAILY_LIMIT: "2",
    IMAGE_GENERATION_LIVE_CREDIT_COST: "1",
    OPENAI_API_KEY: "test-key-not-real",
    ...overrides,
  });
}

describe("Live image generation release gate", () => {
  it("defaults to disabled", () => {
    const config = parseLiveImageGateConfig({});

    expect(evaluateLiveImageGate(config, WORKSPACE_A)).toMatchObject({
      allowed: false,
      reason: "disabled",
    });
  });

  it("accepts explicit, allowlisted internal configuration", () => {
    const decision = evaluateLiveImageGate(configured(), WORKSPACE_A);

    expect(decision).toEqual({
      allowed: true,
      model: "gpt-image-2",
      creditCost: 1,
      maxActive: 1,
      dailyLimit: 2,
    });
  });

  it("rejects mock provider mode", () => {
    expect(
      evaluateLiveImageGate(
        configured({
          IMAGE_GENERATION_PROVIDER: "mock",
        }),
        WORKSPACE_A,
      ).allowed,
    ).toBe(false);
  });

  it("requires the live-enabled flag", () => {
    expect(
      evaluateLiveImageGate(
        configured({
          IMAGE_GENERATION_LIVE_ENABLED: "false",
        }),
        WORKSPACE_A,
      ).allowed,
    ).toBe(false);
  });

  it("requires the separate worker flag", () => {
    expect(
      evaluateLiveImageGate(
        configured({
          IMAGE_GENERATION_LIVE_WORKER_ENABLED: "false",
        }),
        WORKSPACE_A,
      ).allowed,
    ).toBe(false);
  });

  it("blocks rollout mode off", () => {
    expect(
      evaluateLiveImageGate(
        configured({
          IMAGE_GENERATION_LIVE_ROLLOUT: "off",
        }),
        WORKSPACE_A,
      ).allowed,
    ).toBe(false);
  });

  it("rejects a non-allowlisted workspace", () => {
    expect(evaluateLiveImageGate(configured(), WORKSPACE_B)).toMatchObject({
      allowed: false,
      reason: "workspace_not_allowed",
    });
  });

  it("requires an API key without exposing it", () => {
    expect(
      evaluateLiveImageGate(
        configured({
          OPENAI_API_KEY: "",
        }),
        WORKSPACE_A,
      ),
    ).toMatchObject({
      allowed: false,
      reason: "configuration",
    });
  });

  it("rejects a different model", () => {
    expect(
      evaluateLiveImageGate(
        configured({
          IMAGE_GENERATION_MODEL: "some-other-model",
        }),
        WORKSPACE_A,
      ).allowed,
    ).toBe(false);
  });

  it("rejects excessive concurrency", () => {
    expect(() =>
      configured({
        IMAGE_GENERATION_LIVE_MAX_ACTIVE: "2",
      }),
    ).toThrow();
  });

  it("rejects excessive daily limits", () => {
    expect(() =>
      configured({
        IMAGE_GENERATION_LIVE_DAILY_LIMIT: "100",
      }),
    ).toThrow();
  });

  it("rejects malformed workspace allowlists", () => {
    expect(() =>
      configured({
        IMAGE_GENERATION_LIVE_WORKSPACE_ALLOWLIST: "not-an-object-id",
      }),
    ).toThrow();
  });

  it("rejects unknown rollout modes", () => {
    expect(() =>
      configured({
        IMAGE_GENERATION_LIVE_ROLLOUT: "public",
      }),
    ).toThrow();
  });

  it("rejects nonboolean flags", () => {
    expect(() =>
      configured({
        IMAGE_GENERATION_LIVE_ENABLED: "yes",
      }),
    ).toThrow();
  });

  it("throws a safe error when access is disabled", () => {
    expect(() =>
      assertLiveImageAllowed(
        configured({
          IMAGE_GENERATION_LIVE_ENABLED: "false",
        }),
        WORKSPACE_A,
      ),
    ).toThrow("Live image generation is unavailable.");
  });

  it("supports an explicit canary rollout", () => {
    const decision = evaluateLiveImageGate(
      configured({
        IMAGE_GENERATION_LIVE_ROLLOUT: "canary",
      }),
      WORKSPACE_A,
    );

    expect(decision.allowed).toBe(true);
  });
});
