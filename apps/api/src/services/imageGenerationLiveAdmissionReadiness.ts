import { IMAGE_CREDIT_COST } from "./imageGenerationAdmissionService.js";

import {
  evaluateLiveImageGate,
  type LiveGateConfig,
} from "./imageGenerationLiveGate.js";

import { LIVE_PAID_WORKER_ARMED } from "./imageGenerationWorkerProviderGate.js";

export type LiveAdmissionReadiness =
  | {
      ready: true;
      provider: "openai";
      model: "gpt-image-2";
      creditCost: number;
      dailyLimit: number;
      maxActive: number;
    }
  | {
      ready: false;
      reason: "release_gate_closed" | "worker_not_armed" | "billing_mismatch";
    };

/**
 * Pure readiness decision.
 *
 * This is not workspace authorization.
 * Authentication, workspace ownership,
 * atomic wallet debit and idempotency
 * remain in admitImageGeneration().
 *
 * Do not expose an alternative admission
 * path that bypasses that transaction.
 */
export function evaluateLiveAdmissionReadiness(
  config: LiveGateConfig,
  workspaceId: string,
): LiveAdmissionReadiness {
  const release = evaluateLiveImageGate(config, workspaceId);

  if (!release.allowed) {
    return {
      ready: false,
      reason: "release_gate_closed",
    };
  }

  // In Step 12.3.6.2 this is intentionally
  // false, even with valid environment flags.
  if (!LIVE_PAID_WORKER_ARMED) {
    return {
      ready: false,
      reason: "worker_not_armed",
    };
  }

  // Existing admission writes a fixed cost
  // to the wallet and credit ledger.
  // Do not admit jobs with a different price.
  if (release.creditCost !== IMAGE_CREDIT_COST) {
    return {
      ready: false,
      reason: "billing_mismatch",
    };
  }

  return {
    ready: true,
    provider: "openai",
    model: release.model,
    creditCost: release.creditCost,
    dailyLimit: release.dailyLimit,
    maxActive: release.maxActive,
  };
}
