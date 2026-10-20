import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getWorkspaceMock, createStateMock, getConfigMock } = vi.hoisted(() => ({
  getWorkspaceMock: vi.fn(),
  createStateMock: vi.fn(),
  getConfigMock: vi.fn(),
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: getWorkspaceMock,
  isValidWorkspaceId: (id: string) => /^[a-f\d]{24}$/i.test(id),
}));

vi.mock("./linkedinOAuthStateService.js", () => ({
  createLinkedInOAuthState: createStateMock,
  LinkedInOAuthStateError: class LinkedInOAuthStateError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("./linkedinConfig.js", () => ({
  getLinkedInOAuthConfig: getConfigMock,
  LinkedInConfigurationError: class LinkedInConfigurationError extends Error {},
}));

import {
  createLinkedInAuthorizationUrl,
  LinkedInAuthorizationError,
} from "./linkedinAuthorizationService.js";

const workspaceId = "507f1f77bcf86cd799439011";
const authUser = {
  id: "supabase-user-123",
  email: "test@example.com",
};

describe("LinkedIn authorization service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getWorkspaceMock.mockResolvedValue({ _id: workspaceId });
    createStateMock.mockResolvedValue("test-state-value");
    getConfigMock.mockReturnValue({
      clientId: "test-client-id",
      clientSecret: "server-only-secret",
      redirectUri: "http://localhost:4000/api/linkedin/callback",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an authorization URL with the expected parameters", async () => {
    const result = await createLinkedInAuthorizationUrl(authUser, workspaceId);

    const url = new URL(result);

    expect(url.origin + url.pathname).toBe(
      "https://www.linkedin.com/oauth/v2/authorization",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4000/api/linkedin/callback",
    );
    expect(url.searchParams.get("state")).toBe("test-state-value");
    expect(url.searchParams.get("scope")).toBe(
      "openid profile w_member_social",
    );
    expect(result).not.toContain("server-only-secret");

    expect(getWorkspaceMock).toHaveBeenCalledWith(authUser, workspaceId);
    expect(createStateMock).toHaveBeenCalledWith({
      supabaseUserId: authUser.id,
      workspaceId,
    });
  });

  it("rejects malformed workspace IDs before checking ownership", async () => {
    await expect(
      createLinkedInAuthorizationUrl(authUser, "not-an-object-id"),
    ).rejects.toMatchObject({
      name: "LinkedInAuthorizationError",
      statusCode: 404,
    });

    expect(getWorkspaceMock).not.toHaveBeenCalled();
    expect(createStateMock).not.toHaveBeenCalled();
  });

  it("rejects a workspace the user does not own", async () => {
    getWorkspaceMock.mockResolvedValue(null);

    await expect(
      createLinkedInAuthorizationUrl(authUser, workspaceId),
    ).rejects.toBeInstanceOf(LinkedInAuthorizationError);

    expect(createStateMock).not.toHaveBeenCalled();
  });

  it("returns 503 when LinkedIn is not configured", async () => {
    const { LinkedInConfigurationError } = await import("./linkedinConfig.js");

    getConfigMock.mockImplementation(() => {
      throw new LinkedInConfigurationError(
        "LinkedIn OAuth is not configured on the server.",
      );
    });

    await expect(
      createLinkedInAuthorizationUrl(authUser, workspaceId),
    ).rejects.toMatchObject({
      name: "LinkedInAuthorizationError",
      statusCode: 503,
    });

    expect(createStateMock).not.toHaveBeenCalled();
  });

  it("does not generate an authorization URL if state creation fails", async () => {
    createStateMock.mockRejectedValue(new Error("Database unavailable"));

    await expect(
      createLinkedInAuthorizationUrl(authUser, workspaceId),
    ).rejects.toThrow("Database unavailable");
  });
});
