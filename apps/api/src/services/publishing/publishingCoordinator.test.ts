import { describe, expect, it } from "vitest";
import { summarizePublishingResult } from "./publishingCoordinator.js";
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
      allPublished: false,
    });
  });
});
