export const LIVE_IMAGE_MODEL = "gpt-image-2" as const;

export type LiveRolloutMode = "off" | "internal" | "canary";

export type LiveGateConfig = {
  provider: "mock" | "openai";
  liveEnabled: boolean;
  workerEnabled: boolean;
  rollout: LiveRolloutMode;
  model: string;
  workspaceAllowlist: ReadonlySet<string>;
  maxActive: number;
  dailyLimit: number;
  creditCost: number;
  hasApiKey: boolean;
};

export type LiveGateDecision =
  | {
      allowed: true;
      model: typeof LIVE_IMAGE_MODEL;
      creditCost: number;
      maxActive: number;
      dailyLimit: number;
    }
  | {
      allowed: false;
      reason: "disabled" | "configuration" | "workspace_not_allowed";
    };

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/;

function environmentBoolean(value: string | undefined): boolean {
  return value === "true";
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("Invalid live image limit configuration.");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Invalid live image limit configuration.");
  }

  return parsed;
}

function parseAllowlist(value: string | undefined): ReadonlySet<string> {
  if (!value?.trim()) {
    return new Set();
  }

  const ids = value.split(",").map((item) => item.trim());

  if (ids.some((id) => !OBJECT_ID_PATTERN.test(id))) {
    throw new Error("Invalid live image workspace allowlist.");
  }

  return new Set(ids);
}

/**
 * Parse trusted server-side configuration.
 *
 * Invalid values fail closed.
 * This function never reads browser input.
 */
export function parseLiveImageGateConfig(
  source: NodeJS.ProcessEnv,
): LiveGateConfig {
  const provider = source.IMAGE_GENERATION_PROVIDER;

  if (provider !== undefined && provider !== "mock" && provider !== "openai") {
    throw new Error("Invalid image generation provider.");
  }

  const rollout = source.IMAGE_GENERATION_LIVE_ROLLOUT ?? "off";

  if (rollout !== "off" && rollout !== "internal" && rollout !== "canary") {
    throw new Error("Invalid live image rollout mode.");
  }

  for (const key of [
    "IMAGE_GENERATION_LIVE_ENABLED",
    "IMAGE_GENERATION_LIVE_WORKER_ENABLED",
  ] as const) {
    const value = source[key];

    if (value !== undefined && value !== "true" && value !== "false") {
      throw new Error(`Invalid boolean configuration: ${key}`);
    }
  }

  const maxActive = positiveInteger(source.IMAGE_GENERATION_LIVE_MAX_ACTIVE, 1);

  const dailyLimit = positiveInteger(
    source.IMAGE_GENERATION_LIVE_DAILY_LIMIT,
    2,
  );

  const creditCost = positiveInteger(
    source.IMAGE_GENERATION_LIVE_CREDIT_COST,
    1,
  );

  // Guardrail caps for initial canary rollout.
  // Raising these requires a code review,
  // not merely changing an environment variable.
  if (maxActive > 1 || dailyLimit > 5 || creditCost > 100) {
    throw new Error("Live image rollout limits exceed approved caps.");
  }

  return {
    provider: provider ?? "mock",
    liveEnabled: environmentBoolean(source.IMAGE_GENERATION_LIVE_ENABLED),
    workerEnabled: environmentBoolean(
      source.IMAGE_GENERATION_LIVE_WORKER_ENABLED,
    ),
    rollout,
    model: source.IMAGE_GENERATION_MODEL ?? LIVE_IMAGE_MODEL,
    workspaceAllowlist: parseAllowlist(
      source.IMAGE_GENERATION_LIVE_WORKSPACE_ALLOWLIST,
    ),
    maxActive,
    dailyLimit,
    creditCost,
    hasApiKey: Boolean(source.OPENAI_API_KEY?.trim()),
  };
}

/**
 * Pure decision function.
 *
 * It authorizes provider selection only.
 * Workspace ownership and wallet checks
 * remain mandatory in the admission service.
 */
export function evaluateLiveImageGate(
  config: LiveGateConfig,
  workspaceId: string,
): LiveGateDecision {
  if (
    config.provider !== "openai" ||
    !config.liveEnabled ||
    !config.workerEnabled ||
    config.rollout === "off"
  ) {
    return {
      allowed: false,
      reason: "disabled",
    };
  }

  if (
    !config.hasApiKey ||
    config.model !== LIVE_IMAGE_MODEL ||
    config.maxActive !== 1 ||
    config.dailyLimit < 1 ||
    config.dailyLimit > 5 ||
    config.creditCost < 1 ||
    !Number.isSafeInteger(config.creditCost)
  ) {
    return {
      allowed: false,
      reason: "configuration",
    };
  }

  if (
    !OBJECT_ID_PATTERN.test(workspaceId) ||
    !config.workspaceAllowlist.has(workspaceId)
  ) {
    return {
      allowed: false,
      reason: "workspace_not_allowed",
    };
  }

  return {
    allowed: true,
    model: LIVE_IMAGE_MODEL,
    creditCost: config.creditCost,
    maxActive: config.maxActive,
    dailyLimit: config.dailyLimit,
  };
}

/**
 * A release-gate assertion for a future
 * backend controller or worker.
 *
 * Never log the API key or raw environment.
 */
export function assertLiveImageAllowed(
  config: LiveGateConfig,
  workspaceId: string,
) {
  const decision = evaluateLiveImageGate(config, workspaceId);

  if (!decision.allowed) {
    const error = new Error("Live image generation is unavailable.");

    Object.assign(error, {
      statusCode: 503,
    });

    throw error;
  }

  return decision;
}
