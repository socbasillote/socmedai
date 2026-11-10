import { describe, expect, it } from "vitest";

import { parseLiveImageGateConfig } from "./imageGenerationLiveGate.js";

import {
  LIVE_PAID_WORKER_ARMED,
  selectWorkerImageProvider,
  WorkerProviderNotAllowedError,
} from "./imageGenerationWorkerProviderGate.js";

const WORKSPACE = "507f1f77bcf86cd799439011";

const liveConfig = parseLiveImageGateConfig({
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
});

describe("Persisted worker provider selection", () => {
  it("allows existing mock jobs", () => {
    expect(
      selectWorkerImageProvider(
        {
          workspaceId: WORKSPACE,
          provider: "mock",
          model: "existing-mock-model",
        },
        liveConfig,
      ),
    ).toEqual({
      kind: "mock",
    });
  });

  it("keeps paid execution unarmed", () => {
    expect(LIVE_PAID_WORKER_ARMED).toBe(false);
  });

  it("rejects live jobs despite valid rollout configuration", () => {
    expect(() =>
      selectWorkerImageProvider(
        {
          workspaceId: WORKSPACE,
          provider: "openai",
          model: "gpt-image-2",
        },
        liveConfig,
      ),
    ).toThrow(WorkerProviderNotAllowedError);
  });

  it("rejects unsupported persisted models", () => {
    expect(() =>
      selectWorkerImageProvider(
        {
          workspaceId: WORKSPACE,
          provider: "openai",
          model: "unapproved-model",
        },
        liveConfig,
      ),
    ).toThrow(WorkerProviderNotAllowedError);
  });

  it("rejects unknown providers", () => {
    expect(() =>
      selectWorkerImageProvider(
        {
          workspaceId: WORKSPACE,
          provider: "unknown",
          model: "gpt-image-2",
        },
        liveConfig,
      ),
    ).toThrow(WorkerProviderNotAllowedError);
  });
});
