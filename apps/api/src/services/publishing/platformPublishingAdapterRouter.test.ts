import { describe, expect, it, vi } from "vitest";

import { PlatformPublishingAdapterRouter } from "./platformPublishingAdapterRouter.js";

import type {
  PublishingAdapter,
  PublishingInput,
  PublishingPlatform,
} from "./publishingAdapter.js";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const POST_ID = "507f1f77bcf86cd799439012";

const FACEBOOK_CONNECTION_ID = "507f1f77bcf86cd799439013";

const LINKEDIN_CONNECTION_ID = "507f1f77bcf86cd799439014";

function createInput(platform: PublishingPlatform): PublishingInput {
  const base = {
    postId: POST_ID,
    workspaceId: WORKSPACE_ID,
    caption: "Storm publishing router test",
    mediaIds: [],
  };

  if (platform === "linkedin") {
    return {
      ...base,
      platform: "linkedin",
      connectionId: LINKEDIN_CONNECTION_ID,
    };
  }

  if (platform === "facebook") {
    return {
      ...base,
      platform: "facebook",
      connectionId: FACEBOOK_CONNECTION_ID,
    };
  }

  return {
    ...base,
    platform: "instagram",
  };
}

function createMockAdapter() {
  const publish = vi.fn<PublishingAdapter["publish"]>(async (input) => ({
    outcome: "simulated",
    postId: input.postId,
    platform: input.platform,
    simulatedAt: new Date("2026-10-30T00:00:00.000Z"),
    message: "Dry run completed.",
  }));

  return {
    publish,
  } satisfies PublishingAdapter;
}

describe("PlatformPublishingAdapterRouter", () => {
  it("routes Facebook requests only to the Facebook adapter", async () => {
    const facebook = createMockAdapter();
    const linkedin = createMockAdapter();
    const instagram = createMockAdapter();

    const router = new PlatformPublishingAdapterRouter({
      facebook,
      linkedin,
      instagram,
    });

    const input = createInput("facebook");

    const result = await router.publish(input);

    expect(facebook.publish).toHaveBeenCalledOnce();
    expect(facebook.publish).toHaveBeenCalledWith(input);

    expect(linkedin.publish).not.toHaveBeenCalled();
    expect(instagram.publish).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      outcome: "simulated",
      postId: POST_ID,
      platform: "facebook",
    });
  });

  it("routes LinkedIn requests only to the LinkedIn adapter", async () => {
    const facebook = createMockAdapter();
    const linkedin = createMockAdapter();
    const instagram = createMockAdapter();

    const router = new PlatformPublishingAdapterRouter({
      facebook,
      linkedin,
      instagram,
    });

    const input = createInput("linkedin");

    const result = await router.publish(input);

    expect(linkedin.publish).toHaveBeenCalledOnce();
    expect(linkedin.publish).toHaveBeenCalledWith(input);

    expect(facebook.publish).not.toHaveBeenCalled();
    expect(instagram.publish).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      outcome: "simulated",
      postId: POST_ID,
      platform: "linkedin",
    });
  });

  it("routes Instagram requests only to the Instagram adapter", async () => {
    const facebook = createMockAdapter();
    const linkedin = createMockAdapter();
    const instagram = createMockAdapter();

    const router = new PlatformPublishingAdapterRouter({
      facebook,
      linkedin,
      instagram,
    });

    const input = createInput("instagram");

    const result = await router.publish(input);

    expect(instagram.publish).toHaveBeenCalledOnce();
    expect(instagram.publish).toHaveBeenCalledWith(input);

    expect(facebook.publish).not.toHaveBeenCalled();
    expect(linkedin.publish).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      outcome: "simulated",
      postId: POST_ID,
      platform: "instagram",
    });
  });

  it.each(["facebook", "linkedin", "instagram"] as const)(
    "rejects %s when no adapter is configured",
    async (platform) => {
      const router = new PlatformPublishingAdapterRouter({});

      const result = await router.publish(createInput(platform));

      expect(result).toEqual({
        outcome: "failed",
        postId: POST_ID,
        platform,
        message: `Publishing is not configured for ${platform}.`,
      });
    },
  );

  it("never falls back to another platform adapter", async () => {
    const linkedin = createMockAdapter();

    const router = new PlatformPublishingAdapterRouter({
      linkedin,
    });

    const result = await router.publish(createInput("facebook"));

    expect(result).toEqual({
      outcome: "failed",
      postId: POST_ID,
      platform: "facebook",
      message: "Publishing is not configured for facebook.",
    });

    expect(linkedin.publish).not.toHaveBeenCalled();
  });

  it("forwards the original publishing input unchanged", async () => {
    const facebook = createMockAdapter();

    const router = new PlatformPublishingAdapterRouter({
      facebook,
    });

    const input = createInput("facebook");

    await router.publish(input);

    const forwardedInput = facebook.publish.mock.calls[0]?.[0];

    expect(forwardedInput).toBe(input);

    expect(forwardedInput).toEqual({
      postId: POST_ID,
      workspaceId: WORKSPACE_ID,
      platform: "facebook",
      connectionId: FACEBOOK_CONNECTION_ID,
      caption: "Storm publishing router test",
      mediaIds: [],
    });
  });

  it("returns the underlying adapter result unchanged", async () => {
    const publishedAt = new Date("2026-10-30T00:00:00.000Z");

    const expectedResult = {
      outcome: "published" as const,
      postId: POST_ID,
      platform: "facebook" as const,
      externalPostId: "123456789_987654321",
      publishedAt,
    };

    const facebook: PublishingAdapter = {
      publish: vi
        .fn<PublishingAdapter["publish"]>()
        .mockResolvedValue(expectedResult),
    };

    const router = new PlatformPublishingAdapterRouter({
      facebook,
    });

    const result = await router.publish(createInput("facebook"));

    expect(result).toBe(expectedResult);
  });

  it("propagates unexpected adapter errors", async () => {
    const error = new Error("External request outcome is uncertain.");

    const facebook: PublishingAdapter = {
      publish: vi.fn<PublishingAdapter["publish"]>().mockRejectedValue(error),
    };

    const router = new PlatformPublishingAdapterRouter({
      facebook,
    });

    await expect(router.publish(createInput("facebook"))).rejects.toBe(error);
  });

  it("copies the adapter configuration at construction", async () => {
    const firstFacebookAdapter = createMockAdapter();

    const replacementFacebookAdapter = createMockAdapter();

    const configuration = {
      facebook: firstFacebookAdapter,
    };

    const router = new PlatformPublishingAdapterRouter(configuration);

    // Changing the original object must not
    // silently redirect publishing.
    configuration.facebook = replacementFacebookAdapter;

    await router.publish(createInput("facebook"));

    expect(firstFacebookAdapter.publish).toHaveBeenCalledOnce();

    expect(replacementFacebookAdapter.publish).not.toHaveBeenCalled();
  });

  it("rejects an unsupported runtime platform", async () => {
    const facebook = createMockAdapter();
    const linkedin = createMockAdapter();
    const instagram = createMockAdapter();

    const router = new PlatformPublishingAdapterRouter({
      facebook,
      linkedin,
      instagram,
    });

    // Simulate an untyped caller bypassing
    // compile-time platform validation.
    const invalidInput = {
      postId: POST_ID,
      workspaceId: WORKSPACE_ID,
      platform: "threads",
      caption: "Unsupported platform",
      mediaIds: [],
    } as unknown as PublishingInput;

    const result = await router.publish(invalidInput);

    expect(result).toEqual({
      outcome: "failed",
      postId: POST_ID,
      platform: "threads",
      message: "Publishing is not configured for threads.",
    });

    expect(facebook.publish).not.toHaveBeenCalled();
    expect(linkedin.publish).not.toHaveBeenCalled();
    expect(instagram.publish).not.toHaveBeenCalled();
  });
});
