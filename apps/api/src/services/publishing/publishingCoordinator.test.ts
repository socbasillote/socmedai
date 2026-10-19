import { describe, expect, it } from "vitest";
import {
  reconcileOverallPostStatus,
  summarizePublishingResult,
} from "./publishingCoordinator.js";
import type { ProcessPostResult } from "./publishingService.js";

describe("summarizePublishingResult", () => {
  it("counts simulated results without marking them as published", () => {
    const result: ProcessPostResult = {
      postId: "post-123",
      results: [
        {
          outcome: "simulated",
          postId: "post-123",
          platform: "facebook",
          simulatedAt: new Date(),
          message: "Dry run completed.",
        },
        {
          outcome: "simulated",
          postId: "post-123",
          platform: "instagram",
          simulatedAt: new Date(),
          message: "Dry run completed.",
        },
      ],
    };

    expect(summarizePublishingResult(result)).toEqual({
      postId: "post-123",
      simulatedCount: 2,
      publishedCount: 0,
      failedCount: 0,
      unknownCount: 0,
      allPublished: false,
    });
  });

  it("recognizes when all platforms report actual publication", () => {
    const result: ProcessPostResult = {
      postId: "post-456",
      results: [
        {
          outcome: "published",
          postId: "post-456",
          platform: "facebook",
          externalPostId: "external-1",
          publishedAt: new Date(),
        },
        {
          outcome: "published",
          postId: "post-456",
          platform: "linkedin",
          externalPostId: "external-2",
          publishedAt: new Date(),
        },
      ],
    };

    expect(summarizePublishingResult(result)).toEqual({
      postId: "post-456",
      simulatedCount: 0,
      publishedCount: 2,
      failedCount: 0,
      unknownCount: 0,
      allPublished: true,
    });
  });

  it("reports mixed outcomes without claiming all platforms succeeded", () => {
    const result: ProcessPostResult = {
      postId: "post-789",
      results: [
        {
          outcome: "published",
          postId: "post-789",
          platform: "facebook",
          externalPostId: "external-3",
          publishedAt: new Date(),
        },
        {
          outcome: "failed",
          postId: "post-789",
          platform: "instagram",
          message: "Platform request failed.",
        },
        {
          outcome: "simulated",
          postId: "post-789",
          platform: "linkedin",
          simulatedAt: new Date(),
          message: "Dry run completed.",
        },
      ],
    };

    expect(summarizePublishingResult(result)).toEqual({
      postId: "post-789",
      simulatedCount: 1,
      publishedCount: 1,
      failedCount: 1,
      unknownCount: 0,
      allPublished: false,
    });
  });

  it("counts unknown outcomes without marking them as published", () => {
    const result: ProcessPostResult = {
      postId: "post-unknown",
      results: [
        {
          outcome: "unknown",
          postId: "post-unknown",
          platform: "facebook",
          message: "Publishing outcome is unknown after an unexpected error.",
        },
      ],
    };

    expect(summarizePublishingResult(result)).toEqual({
      postId: "post-unknown",
      simulatedCount: 0,
      publishedCount: 0,
      failedCount: 0,
      unknownCount: 1,
      allPublished: false,
    });
  });

  it("does not treat an empty result as successful publication", () => {
    const result: ProcessPostResult = {
      postId: "post-empty",
      results: [],
    };

    expect(summarizePublishingResult(result)).toEqual({
      postId: "post-empty",
      simulatedCount: 0,
      publishedCount: 0,
      failedCount: 0,
      unknownCount: 0,
      allPublished: false,
    });
  });
});

describe("reconcileOverallPostStatus", () => {
  it("marks the post published only when every platform is published", () => {
    expect(
      reconcileOverallPostStatus("publishing", ["published", "published"]),
    ).toBe("published");
  });

  it("keeps the post publishing while a platform outcome is unknown", () => {
    expect(
      reconcileOverallPostStatus("publishing", ["published", "unknown"]),
    ).toBe("publishing");
  });

  it("keeps the post publishing while a platform is still in progress", () => {
    expect(
      reconcileOverallPostStatus("scheduled", ["published", "publishing"]),
    ).toBe("publishing");
  });

  it("marks mixed confirmed publication and failure as failed", () => {
    expect(
      reconcileOverallPostStatus("publishing", ["published", "failed"]),
    ).toBe("failed");
  });

  it("does not treat simulated results as real publication", () => {
    expect(
      reconcileOverallPostStatus("scheduled", ["simulated", "simulated"]),
    ).toBe("scheduled");
  });

  it("preserves the current status when no platform results exist", () => {
    expect(reconcileOverallPostStatus("scheduled", [])).toBe("scheduled");
  });
});
