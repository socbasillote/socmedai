import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserWorkspaceByIdMock,
  isValidWorkspaceIdMock,
  createFacebookOAuthStateMock,
  getFacebookOAuthConfigMock,
  mockEnv,
} = vi.hoisted(() => ({
  getUserWorkspaceByIdMock: vi.fn(),
  isValidWorkspaceIdMock: vi.fn(),
  createFacebookOAuthStateMock: vi.fn(),
  getFacebookOAuthConfigMock: vi.fn(),
  mockEnv: {
    FACEBOOK_GRAPH_API_VERSION: "v25.0" as string | undefined,
  },
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: getUserWorkspaceByIdMock,
  isValidWorkspaceId: isValidWorkspaceIdMock,
}));

vi.mock("./facebookOAuthStateService.js", () => ({
  createFacebookOAuthState: createFacebookOAuthStateMock,

  FacebookOAuthStateError: class FacebookOAuthStateError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "FacebookOAuthStateError";
    }
  },
}));

vi.mock("./facebookConfig.js", () => ({
  getFacebookOAuthConfig: getFacebookOAuthConfigMock,

  FacebookConfigurationError: class FacebookConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "FacebookConfigurationError";
    }
  },
}));

vi.mock("../../config/env.js", () => ({
  env: mockEnv,
}));

import {
  createFacebookAuthorizationUrl,
  FacebookAuthorizationError,
} from "./facebookAuthorizationService.js";

import { FacebookConfigurationError } from "./facebookConfig.js";
import { FacebookOAuthStateError } from "./facebookOAuthStateService.js";

import type { AuthenticatedUser } from "../userProfileService.js";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const AUTH_USER = {
  id: "user-123",
} as AuthenticatedUser;

describe("Facebook authorization service", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockEnv.FACEBOOK_GRAPH_API_VERSION = "v25.0";

    isValidWorkspaceIdMock.mockReturnValue(true);

    getUserWorkspaceByIdMock.mockResolvedValue({
      _id: WORKSPACE_ID,
    });

    getFacebookOAuthConfigMock.mockReturnValue({
      appId: "test-facebook-app-id",
      appSecret: "test-facebook-app-secret",
      redirectUri: "http://localhost:4000/api/facebook/callback",
    });

    createFacebookOAuthStateMock.mockResolvedValue("A".repeat(43));
  });

  it("rejects an invalid workspace ID", async () => {
    isValidWorkspaceIdMock.mockReturnValue(false);

    await expect(
      createFacebookAuthorizationUrl(AUTH_USER, "invalid-workspace"),
    ).rejects.toMatchObject({
      name: "FacebookAuthorizationError",
      statusCode: 404,
    });

    expect(getUserWorkspaceByIdMock).not.toHaveBeenCalled();
    expect(createFacebookOAuthStateMock).not.toHaveBeenCalled();
  });

  it("rejects users without access to the workspace", async () => {
    getUserWorkspaceByIdMock.mockResolvedValue(null);

    await expect(
      createFacebookAuthorizationUrl(AUTH_USER, WORKSPACE_ID),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(createFacebookOAuthStateMock).not.toHaveBeenCalled();
  });

  it("rejects missing Facebook configuration", async () => {
    getFacebookOAuthConfigMock.mockImplementation(() => {
      throw new FacebookConfigurationError(
        "Facebook OAuth is not configured on the server.",
      );
    });

    await expect(
      createFacebookAuthorizationUrl(AUTH_USER, WORKSPACE_ID),
    ).rejects.toMatchObject({
      name: "FacebookAuthorizationError",
      statusCode: 503,
    });

    expect(createFacebookOAuthStateMock).not.toHaveBeenCalled();
  });

  it("rejects a missing Graph API version", async () => {
    mockEnv.FACEBOOK_GRAPH_API_VERSION = undefined;

    await expect(
      createFacebookAuthorizationUrl(AUTH_USER, WORKSPACE_ID),
    ).rejects.toMatchObject({
      statusCode: 503,
    });

    expect(createFacebookOAuthStateMock).not.toHaveBeenCalled();
  });

  it("creates a Facebook authorization URL with correct parameters", async () => {
    const authorizationUrl = await createFacebookAuthorizationUrl(
      AUTH_USER,
      WORKSPACE_ID,
    );

    const url = new URL(authorizationUrl);

    expect(url.origin).toBe("https://www.facebook.com");

    expect(url.pathname).toBe("/v25.0/dialog/oauth");

    expect(url.searchParams.get("client_id")).toBe("test-facebook-app-id");

    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4000/api/facebook/callback",
    );

    expect(url.searchParams.get("response_type")).toBe("code");

    expect(url.searchParams.get("state")).toBe("A".repeat(43));

    expect(url.searchParams.get("scope")?.split(",")).toEqual([
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
    ]);

    expect(createFacebookOAuthStateMock).toHaveBeenCalledWith({
      supabaseUserId: "user-123",
      workspaceId: WORKSPACE_ID,
    });
  });

  it("creates OAuth state only after validating workspace access", async () => {
    await createFacebookAuthorizationUrl(AUTH_USER, WORKSPACE_ID);

    expect(getUserWorkspaceByIdMock).toHaveBeenCalledWith(
      AUTH_USER,
      WORKSPACE_ID,
    );

    expect(createFacebookOAuthStateMock).toHaveBeenCalledOnce();
  });

  it("converts OAuth state errors into authorization errors", async () => {
    createFacebookOAuthStateMock.mockRejectedValueOnce(
      new FacebookOAuthStateError("Invalid authenticated user.", 401),
    );

    await expect(
      createFacebookAuthorizationUrl(AUTH_USER, WORKSPACE_ID),
    ).rejects.toMatchObject({
      name: "FacebookAuthorizationError",
      statusCode: 401,
    });
  });

  it("preserves unexpected errors for higher-level handling", async () => {
    createFacebookOAuthStateMock.mockRejectedValueOnce(
      new Error("Unexpected database failure"),
    );

    await expect(
      createFacebookAuthorizationUrl(AUTH_USER, WORKSPACE_ID),
    ).rejects.toThrow("Unexpected database failure");
  });

  it("uses the configured Graph API version", async () => {
    mockEnv.FACEBOOK_GRAPH_API_VERSION = "v24.0";

    const authorizationUrl = await createFacebookAuthorizationUrl(
      AUTH_USER,
      WORKSPACE_ID,
    );

    const url = new URL(authorizationUrl);

    expect(url.pathname).toBe("/v24.0/dialog/oauth");
  });

  it("returns a FacebookAuthorizationError for invalid workspaces", async () => {
    isValidWorkspaceIdMock.mockReturnValue(false);

    await expect(
      createFacebookAuthorizationUrl(AUTH_USER, "invalid"),
    ).rejects.toBeInstanceOf(FacebookAuthorizationError);
  });
});
