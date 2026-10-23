import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizePublishing: vi.fn(),
  getLinkedInPublishingCredentials: vi.fn(),
  publishLinkedInTextPost: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock("./publishingAuthorizationService.js", () => ({
  authorizePublishing: mocks.authorizePublishing,
}));

vi.mock("../linkedin/linkedinPublishingTokenService.js", () => ({
  getLinkedInPublishingCredentials: mocks.getLinkedInPublishingCredentials,
}));

vi.mock("../linkedin/linkedinPostService.js", () => ({
  publishLinkedInTextPost: mocks.publishLinkedInTextPost,
}));

vi.mock("../../models/Post.js", () => ({
  default: {
    findOne: mocks.findOne,
  },
}));

import { LinkedInPublishingAdapter } from "./linkedinPublishingAdapter.js";

describe("LinkedInPublishingAdapter", () => {
  const authUser = {
    id: "supabase-user-123",
    email: "test@example.com",
  };

  const input = {
    postId: "post-123",
    workspaceId: "workspace-123",
    connectionId: "507f1f77bcf86cd799439011",
    platform: "linkedin" as const,
    caption: "Caller-provided caption",
    mediaIds: [],
  };

  const persistedPost: {
    caption: string;
    mediaIds: string[];
    platforms: string[];
    platformConnections?: {
      linkedin?: string;
    };
  } = {
    caption: "Persisted LinkedIn caption",
    mediaIds: [],
    platforms: ["linkedin"],
    platformConnections: {
      linkedin: "507f1f77bcf86cd799439011",
    },
  };

  function mockPost(post: typeof persistedPost | null) {
    const lean = vi.fn().mockResolvedValue(post);
    const select = vi.fn().mockReturnValue({ lean });

    mocks.findOne.mockReturnValue({ select });
  }

  beforeEach(() => {
    vi.resetAllMocks();

    mocks.authorizePublishing.mockResolvedValue(undefined);

    mocks.getLinkedInPublishingCredentials.mockResolvedValue({
      accessToken: "test-access-token",
      linkedinMemberId: "member-123",
      connectionId: "connection-123",
    });

    mocks.publishLinkedInTextPost.mockResolvedValue({
      outcome: "published",
      externalPostId: "urn:li:share:123456",
    });

    mockPost(persistedPost);
  });

  it("publishes the persisted caption after authorization", async () => {
    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(mocks.authorizePublishing).toHaveBeenCalledWith({
      authUser,
      workspaceId: "workspace-123",
      postId: "post-123",
    });

    expect(mocks.findOne).toHaveBeenCalledWith({
      _id: "post-123",
      workspaceId: "workspace-123",
    });

    expect(mocks.getLinkedInPublishingCredentials).toHaveBeenCalledWith({
      authUser,
      workspaceId: "workspace-123",
      connectionId: "507f1f77bcf86cd799439011",
    });

    expect(mocks.publishLinkedInTextPost).toHaveBeenCalledWith({
      accessToken: "test-access-token",
      linkedinMemberId: "member-123",
      caption: "Persisted LinkedIn caption",
    });

    expect(result).toMatchObject({
      outcome: "published",
      postId: "post-123",
      platform: "linkedin",
      externalPostId: "urn:li:share:123456",
    });

    if (result.outcome === "published") {
      expect(result.publishedAt).toBeInstanceOf(Date);
    }
  });

  it("rejects unsupported platforms", async () => {
    const adapter = new LinkedInPublishingAdapter(authUser);

    const { connectionId: _connectionId, ...baseInput } = input;

    const result = await adapter.publish({
      ...baseInput,
      platform: "facebook",
    });

    expect(result.outcome).toBe("failed");

    expect(mocks.authorizePublishing).not.toHaveBeenCalled();
    expect(mocks.publishLinkedInTextPost).not.toHaveBeenCalled();
  });

  it("rejects media in the publishing input", async () => {
    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish({
      ...input,
      mediaIds: ["media-123"],
    });

    expect(result.outcome).toBe("failed");

    expect(mocks.authorizePublishing).not.toHaveBeenCalled();
    expect(mocks.publishLinkedInTextPost).not.toHaveBeenCalled();
  });

  it("rejects unauthorized publishing", async () => {
    mocks.authorizePublishing.mockRejectedValue(
      new Error("Workspace not found."),
    );

    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(result.outcome).toBe("failed");

    expect(mocks.getLinkedInPublishingCredentials).not.toHaveBeenCalled();
    expect(mocks.publishLinkedInTextPost).not.toHaveBeenCalled();
  });

  it("rejects a missing persisted post", async () => {
    mockPost(null);

    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(result.outcome).toBe("failed");

    expect(mocks.publishLinkedInTextPost).not.toHaveBeenCalled();
  });

  it("rejects media found in the persisted post", async () => {
    mockPost({
      ...persistedPost,
      mediaIds: ["media-123"],
    });

    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(result.outcome).toBe("failed");

    expect(mocks.publishLinkedInTextPost).not.toHaveBeenCalled();
  });

  it("rejects posts not configured for LinkedIn", async () => {
    mockPost({
      ...persistedPost,
      platforms: ["facebook"],
    });

    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(result.outcome).toBe("failed");

    expect(mocks.publishLinkedInTextPost).not.toHaveBeenCalled();
  });

  it("rejects an empty persisted caption", async () => {
    mockPost({
      ...persistedPost,
      caption: "   ",
    });

    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(result.outcome).toBe("failed");

    expect(mocks.publishLinkedInTextPost).not.toHaveBeenCalled();
  });

  it("rejects unavailable LinkedIn credentials", async () => {
    mocks.getLinkedInPublishingCredentials.mockRejectedValue(
      new Error("LinkedIn connection unavailable."),
    );

    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(result.outcome).toBe("failed");

    expect(mocks.publishLinkedInTextPost).not.toHaveBeenCalled();
  });

  it("preserves a definitive LinkedIn API failure", async () => {
    mocks.publishLinkedInTextPost.mockResolvedValue({
      outcome: "failed",
      message: "LinkedIn rejected the publishing request (HTTP 403).",
    });

    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(result).toEqual({
      outcome: "failed",
      postId: "post-123",
      platform: "linkedin",
      message: "LinkedIn rejected the publishing request (HTTP 403).",
    });
  });

  it("preserves an unknown LinkedIn publishing outcome", async () => {
    mocks.publishLinkedInTextPost.mockResolvedValue({
      outcome: "unknown",
      message: "LinkedIn publishing outcome is uncertain.",
    });

    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(result).toEqual({
      outcome: "unknown",
      postId: "post-123",
      platform: "linkedin",
      message: "LinkedIn publishing outcome is uncertain.",
    });
  });

  it("rejects a post without a persisted LinkedIn account selection", async () => {
    mockPost({
      ...persistedPost,
      platformConnections: undefined,
    });

    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(result).toEqual({
      outcome: "failed",
      postId: "post-123",
      platform: "linkedin",
      message: "No LinkedIn account was selected for this post.",
    });

    expect(mocks.getLinkedInPublishingCredentials).not.toHaveBeenCalled();
    expect(mocks.publishLinkedInTextPost).not.toHaveBeenCalled();
  });

  it("rejects a connection ID that differs from the persisted selection", async () => {
    mockPost({
      ...persistedPost,
      platformConnections: {
        linkedin: "507f191e810c19729de860ea",
      },
    });

    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(result).toEqual({
      outcome: "failed",
      postId: "post-123",
      platform: "linkedin",
      message: "The selected LinkedIn account does not match this post.",
    });

    expect(mocks.getLinkedInPublishingCredentials).not.toHaveBeenCalled();
    expect(mocks.publishLinkedInTextPost).not.toHaveBeenCalled();
  });

  it("returns unknown when the LinkedIn publishing service throws", async () => {
    mocks.publishLinkedInTextPost.mockRejectedValueOnce(
      new Error("Unexpected network failure"),
    );

    const adapter = new LinkedInPublishingAdapter(authUser);

    const result = await adapter.publish(input);

    expect(result).toEqual({
      outcome: "unknown",
      postId: "post-123",
      platform: "linkedin",
      message:
        "LinkedIn publishing encountered an unexpected error. " +
        "The publication outcome is unknown. " +
        "Check LinkedIn before retrying.",
    });

    expect(mocks.publishLinkedInTextPost).toHaveBeenCalledOnce();
  });
});
