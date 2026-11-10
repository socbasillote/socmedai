import "dotenv/config";

import {
  parseLiveImageGateConfig,
  evaluateLiveImageGate,
} from "../services/imageGenerationLiveGate.js";

import { evaluateLiveAdmissionReadiness } from "../services/imageGenerationLiveAdmissionReadiness.js";

import { LIVE_PAID_WORKER_ARMED } from "../services/imageGenerationWorkerProviderGate.js";

function main() {
  const config = parseLiveImageGateConfig(process.env);

  console.log("Live configuration:", {
    provider: config.provider,
    liveEnabled: config.liveEnabled,
    workerEnabled: config.workerEnabled,
    rollout: config.rollout,
    model: config.model,
    workspaceCount: config.workspaceAllowlist.size,
    maxActive: config.maxActive,
    dailyLimit: config.dailyLimit,
    creditCost: config.creditCost,
    hasApiKey: config.hasApiKey,
    paidWorkerArmed: LIVE_PAID_WORKER_ARMED,
  });

  for (const workspaceId of config.workspaceAllowlist) {
    console.log("Release gate:", evaluateLiveImageGate(config, workspaceId));

    console.log(
      "Admission readiness:",
      evaluateLiveAdmissionReadiness(config, workspaceId),
    );
  }
}

main();
