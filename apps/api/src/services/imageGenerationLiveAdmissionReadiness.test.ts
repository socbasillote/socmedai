import { describe, expect, it } from "vitest";

import { parseLiveImageGateConfig } from "./imageGenerationLiveGate.js";

import { evaluateLiveAdmissionReadiness } from "./imageGenerationLiveAdmissionReadiness.js";

const WORKSPACE = "507f1f77bcf86cd799439011";

function configuration(overrides: Record<string, string> = {}) {
  return parseLiveImageGateConfig({
    IMAGE_GENERATION_PROVIDER: "openai",
    IMAGE_GENERATION_LIVE_ENABLED: "true",
    IMAGE_GENERATION_LIVE_WORKER_ENABLED: "true",
    IMAGE_GENERATION_LIVE_ROLLOUT: "internal",
    IMAGE_GENERATION_MODEL: "gpt-image-2",
    IMAGE_GENERATION_LIVE_WORKSPACE_ALLOWLIST: WORKSPACE,
    IMAGE_GENERATION_LIVE_MAX_ACTIVE: "1",
    IMAGE_GENERATION_LIVE_DAILY_LIMIT: "2",
    IMAGE_GENERATION_LIVE_CREDIT_COST: "1",
    OPENAI_API_KEY: "fake-test-key",
    ...overrides,
  });
}

describe("Live image admission readiness", () => {
  it("rejects live admission while paid worker is unarmed", () => {
    expect(evaluateLiveAdmissionReadiness(configuration(), WORKSPACE)).toEqual({
      ready: false,
      reason: "worker_not_armed",
    });
  });

  it("rejects disabled rollout configurations", () => {
    expect(
      evaluateLiveAdmissionReadiness(
        configuration({
          IMAGE_GENERATION_LIVE_ROLLOUT: "off",
        }),
        WORKSPACE,
      ),
    ).toEqual({
      ready: false,
      reason: "release_gate_closed",
    });
  });

  it("rejects non-allowlisted workspaces", () => {
    expect(
      evaluateLiveAdmissionReadiness(
        configuration(),
        "507f1f77bcf86cd799439099",
      ),
    ).toEqual({
      ready: false,
      reason: "release_gate_closed",
    });
  });

  it("does not allow a pricing change to bypass worker gating", () => {
    expect(
      evaluateLiveAdmissionReadiness(
        configuration({
          IMAGE_GENERATION_LIVE_CREDIT_COST: "3",
        }),
        WORKSPACE,
      ),
    ).toEqual({
      ready: false,
      reason: "worker_not_armed",
    });
  });

  it("rejects missing provider credentials", () => {
    expect(
      evaluateLiveAdmissionReadiness(
        configuration({
          OPENAI_API_KEY: "",
        }),
        WORKSPACE,
      ),
    ).toEqual({
      ready: false,
      reason: "release_gate_closed",
    });
  });
});
