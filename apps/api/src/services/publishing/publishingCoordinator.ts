import type { ProcessPostResult } from "./publishingService.js";

export type PublishingSummary = {
  postId: string;
  simulatedCount: number;
  publishedCount: number;
  failedCount: number;
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

  return {
    postId: result.postId,
    simulatedCount,
    publishedCount,
    failedCount,
    allPublished:
      result.results.length > 0 && publishedCount === result.results.length,
  };
}
