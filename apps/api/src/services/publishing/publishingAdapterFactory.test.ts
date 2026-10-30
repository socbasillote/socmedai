import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PublishingAdapter,
  PublishingInput,
} from "./publishingAdapter.js";

// Mock the real LinkedIn adapter so these tests
// cannot make external publishing requests.
const mocks = vi.hoisted(() => ({
  linkedInConstructor: vi.fn(),
  linkedInPublish: vi.fn(),
}));

vi.mock("./linkedinPublishingAdapter.js", () => ({
  LinkedInPublishingAdapter: class {
    constructor(authUser: unknown) {
      mocks.linkedInConstructor(authUser);
    }

    publish(input: PublishingInput) {
      return mocks.linkedInPublish(input);
    }
  },
}));

import { createPublishingAdapter } from "./publishingAdapterFactory.js";

const authUser = {
  id: "supabase-user-123",
  email: "test@example.com",
};

const workspaceId = "507f1f77bcf86cd799439011";
const postId = "507f1f77bcf86cd799439012";

const facebookConnectionId = "507f1f77bcf86cd799439013";

const linkedinConnectionId = "507f1f77bcf86cd799439014";

const facebookInput: PublishingInput = {
  postId,
  workspaceId,
  platform: "facebook",
  connectionId: facebookConnectionId,
  caption: "Storm Facebook test",
  mediaIds: [],
};

const linkedinInput: PublishingInput = {
  postId,
  workspaceId,
  platform: "linkedin",
  connectionId: linkedinConnectionId,
  caption: "Storm LinkedIn test",
  mediaIds: [],
};

const instagramInput: PublishingInput = {
  postId,
  workspaceId,
  platform: "instagram",
  caption: "Storm Instagram test",
  mediaIds: [],
};

function createMockFacebookAdapter() {
  const publish = vi.fn<PublishingAdapter["publish"]>(async (input) => ({
    outcome: "simulated",
    postId: input.postId,
    platform: input.platform,
    simulatedAt: new Date("2026-10-30T00:00:00.000Z"),
    message: "Facebook dry run completed.",
  }));

  return {
    publish,
  } satisfies PublishingAdapter;
}

describe("createPublishingAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.linkedInPublish.mockImplementation(
      async (input: PublishingInput) => ({
        outcome: "simulated" as const,
        postId: input.postId,
        platform: input.platform,
        simulatedAt: new Date("2026-10-30T00:00:00.000Z"),
        message: "LinkedIn dry run completed.",
      }),
    );
  });

  it("constructs the LinkedIn adapter without publishing", () => {
    createPublishingAdapter(authUser);

    expect(mocks.linkedInConstructor).toHaveBeenCalledOnce();

    expect(mocks.linkedInConstructor).toHaveBeenCalledWith(authUser);

    expect(mocks.linkedInPublish).not.toHaveBeenCalled();
  });

  it("routes LinkedIn publishing by default", async () => {
    const adapter = createPublishingAdapter(authUser);

    const result = await adapter.publish(linkedinInput);

    expect(mocks.linkedInPublish).toHaveBeenCalledOnce();

    expect(mocks.linkedInPublish).toHaveBeenCalledWith(linkedinInput);

    expect(result).toMatchObject({
      outcome: "simulated",
      postId,
      platform: "linkedin",
    });
  });

  it("keeps Facebook disabled by default", async () => {
    const adapter = createPublishingAdapter(authUser);

    const result = await adapter.publish(facebookInput);

    expect(result).toEqual({
      outcome: "failed",
      postId,
      platform: "facebook",
      message: "Publishing is not configured for facebook.",
    });

    expect(mocks.linkedInPublish).not.toHaveBeenCalled();
  });

  it("keeps Instagram disabled by default", async () => {
    const adapter = createPublishingAdapter(authUser);

    const result = await adapter.publish(instagramInput);

    expect(result).toEqual({
      outcome: "failed",
      postId,
      platform: "instagram",
      message: "Publishing is not configured for instagram.",
    });

    expect(mocks.linkedInPublish).not.toHaveBeenCalled();
  });

  it("does not activate Facebook when only an adapter is supplied", async () => {
    const facebook = createMockFacebookAdapter();

    const adapter = createPublishingAdapter(authUser, {
      facebook: {
        adapter: facebook,
      },
    });

    const result = await adapter.publish(facebookInput);

    expect(result).toMatchObject({
      outcome: "failed",
      platform: "facebook",
    });

    expect(facebook.publish).not.toHaveBeenCalled();
    expect(mocks.linkedInPublish).not.toHaveBeenCalled();
  });

  it("does not activate Facebook when enabled is false", async () => {
    const facebook = createMockFacebookAdapter();

    const adapter = createPublishingAdapter(authUser, {
      facebook: {
        enabled: false,
        adapter: facebook,
      },
    });

    const result = await adapter.publish(facebookInput);

    expect(result).toEqual({
      outcome: "failed",
      postId,
      platform: "facebook",
      message: "Publishing is not configured for facebook.",
    });

    expect(facebook.publish).not.toHaveBeenCalled();
  });

  it("does not activate Facebook without an adapter", async () => {
    const adapter = createPublishingAdapter(authUser, {
      facebook: {
        enabled: true,
      },
    });

    const result = await adapter.publish(facebookInput);

    expect(result).toEqual({
      outcome: "failed",
      postId,
      platform: "facebook",
      message: "Publishing is not configured for facebook.",
    });
  });

  it("activates Facebook only with enabled true and an adapter", async () => {
    const facebook = createMockFacebookAdapter();

    const adapter = createPublishingAdapter(authUser, {
      facebook: {
        enabled: true,
        adapter: facebook,
      },
    });

    const result = await adapter.publish(facebookInput);

    expect(facebook.publish).toHaveBeenCalledOnce();

    expect(facebook.publish).toHaveBeenCalledWith(facebookInput);

    // The router must forward the original object.
    expect(facebook.publish.mock.calls[0]?.[0]).toBe(facebookInput);

    expect(result).toMatchObject({
      outcome: "simulated",
      postId,
      platform: "facebook",
    });

    expect(mocks.linkedInPublish).not.toHaveBeenCalled();
  });

  it("requires the activation flag to be exactly true", async () => {
    const facebook = createMockFacebookAdapter();

    // Simulates malformed runtime configuration
    // bypassing the TypeScript type checker.
    const adapter = createPublishingAdapter(authUser, {
      facebook: {
        enabled: "true" as unknown as boolean,
        adapter: facebook,
      },
    });

    const result = await adapter.publish(facebookInput);

    expect(result.outcome).toBe("failed");

    expect(facebook.publish).not.toHaveBeenCalled();
  });

  it("keeps Facebook, LinkedIn, and Instagram isolated", async () => {
    const facebook = createMockFacebookAdapter();

    const adapter = createPublishingAdapter(authUser, {
      facebook: {
        enabled: true,
        adapter: facebook,
      },
    });

    const facebookResult = await adapter.publish(facebookInput);

    const linkedinResult = await adapter.publish(linkedinInput);

    const instagramResult = await adapter.publish(instagramInput);

    expect(facebookResult.outcome).toBe("simulated");
    expect(linkedinResult.outcome).toBe("simulated");
    expect(instagramResult.outcome).toBe("failed");

    expect(facebook.publish).toHaveBeenCalledOnce();

    expect(facebook.publish).toHaveBeenCalledWith(facebookInput);

    expect(mocks.linkedInPublish).toHaveBeenCalledOnce();

    expect(mocks.linkedInPublish).toHaveBeenCalledWith(linkedinInput);

    // No fallback to Facebook or LinkedIn
    // when Instagram is unconfigured.
    expect(instagramResult).toEqual({
      outcome: "failed",
      postId,
      platform: "instagram",
      message: "Publishing is not configured for instagram.",
    });
  });
});
