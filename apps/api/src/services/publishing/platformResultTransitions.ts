import type { PlatformPublishStatus } from "../../models/Post.js";

const ALLOWED_TRANSITIONS: Record<
  PlatformPublishStatus,
  readonly PlatformPublishStatus[]
> = {
  pending: ["publishing", "failed"],
  publishing: ["published", "failed", "unknown", "simulated"],
  published: [],
  failed: ["pending", "publishing"],
  unknown: ["published", "failed"],
  simulated: [],
};

export function canTransitionPlatformResult(
  current: PlatformPublishStatus,
  next: PlatformPublishStatus,
): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}
