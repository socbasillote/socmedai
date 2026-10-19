import type { ProcessPostResult } from "./publishingService.js";
import type { PlatformPublishStatus, PostStatus } from "../../models/Post.js";

export function reconcileOverallPostStatus(
  currentStatus: PostStatus,
  platformStatuses: PlatformPublishStatus[],
): PostStatus {
  if (platformStatuses.length === 0) {
    return currentStatus;
  }

  if (platformStatuses.every((status) => status === "published")) {
    return "published";
  }

  if (
    platformStatuses.some(
      (status) =>
        status === "pending" || status === "publishing" || status === "unknown",
    )
  ) {
    return "publishing";
  }

  if (platformStatuses.some((status) => status === "failed")) {
    return "failed";
  }

  // Simulated results are not proof of actual publication.
  // Preserve the existing overall status in that case.
  return currentStatus;
}

export type PublishingSummary = {
  postId: string;
  simulatedCount: number;
  publishedCount: number;
  failedCount: number;
  unknownCount: number;
  allPublished: boolean;
};

export function summarizePublishingResult(
  result: ProcessPostResult,
): PublishingSummary {
  const simulatedCount = result.results.filter(
    (item) => item.outcome === "simulated",
  ).length;

  const publishedCount = result.results.filter(
    (item) => item.outcome === "published",
  ).length;

  const failedCount = result.results.filter(
    (item) => item.outcome === "failed",
  ).length;

  const unknownCount = result.results.filter(
    (item) => item.outcome === "unknown",
  ).length;

  return {
    postId: result.postId,
    simulatedCount,
    publishedCount,
    failedCount,
    unknownCount,
    allPublished:
      result.results.length > 0 && publishedCount === result.results.length,
  };
}
