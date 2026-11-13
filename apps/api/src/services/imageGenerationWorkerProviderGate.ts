import {
  evaluateLiveImageGate,
  type LiveGateConfig,
} from "./imageGenerationLiveGate.js";

export type PersistedImageProvider = {
  workspaceId: string;
  provider: string;
  model: string;
};

export type WorkerProviderSelection =
  | {
      kind: "mock";
    }
  | {
      kind: "openai";
      model: "gpt-image-2";
    };

export class WorkerProviderNotAllowedError extends Error {
  constructor() {
    super("Image provider is not enabled for this worker.");
    this.name = "WorkerProviderNotAllowedError";
  }
}

/**
 * This is a deliberate compile-time
 * rollout barrier.
 *
 * It is NOT controlled by an environment
 * variable during Step 12.3.6.2.
 *
 * We will review changing it only after
 * admission, billing and recovery pass.
 */
export const LIVE_PAID_WORKER_ARMED = false;

export function selectWorkerImageProvider(
  persisted: PersistedImageProvider,
  config: LiveGateConfig,
): WorkerProviderSelection {
  if (persisted.provider === "mock") {
    // The existing worker remains responsible
    // for verifying its approved mock model.
    return {
      kind: "mock",
    };
  }

  if (persisted.provider !== "openai" || persisted.model !== "gpt-image-2") {
    throw new WorkerProviderNotAllowedError();
  }

  const decision = evaluateLiveImageGate(config, persisted.workspaceId);

  if (!decision.allowed || !LIVE_PAID_WORKER_ARMED) {
    throw new WorkerProviderNotAllowedError();
  }

  return {
    kind: "openai",
    model: decision.model,
  };
}
