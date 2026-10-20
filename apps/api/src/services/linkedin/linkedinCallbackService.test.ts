import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  consumeStateMock,
  exchangeCodeMock,
  fetchProfileMock,
  saveConnectionMock,
} = vi.hoisted(() => ({
  consumeStateMock: vi.fn(),
  exchangeCodeMock: vi.fn(),
  fetchProfileMock: vi.fn(),
  saveConnectionMock: vi.fn(),
}));

vi.mock("./linkedinOAuthStateService.js", () => ({
  consumeLinkedInOAuthState: consumeStateMock,
  LinkedInOAuthStateError: class LinkedInOAuthStateError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "LinkedInOAuthStateError";
    }
  },
}));

vi.mock("./linkedinTokenService.js", () => ({
  exchangeLinkedInAuthorizationCode: exchangeCodeMock,
  LinkedInTokenExchangeError: class LinkedInTokenExchangeError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "LinkedInTokenExchangeError";
    }
  },
}));

vi.mock("./linkedinProfileService.js", () => ({
  fetchLinkedInProfile: fetchProfileMock,
  LinkedInProfileLookupError: class LinkedInProfileLookupError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "LinkedInProfileLookupError";
    }
  },
}));

vi.mock("./linkedinConnectionService.js", () => ({
  saveLinkedInConnection: saveConnectionMock,
  LinkedInConnectionError: class LinkedInConnectionError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "LinkedInConnectionError";
    }
  },
}));

import {
  completeLinkedInOAuthCallback,
  LinkedInCallbackError,
} from "./linkedinCallbackService.js";

const connectionSummary = {
  id: "connection-123",
  workspaceId: "507f1f77bcf86cd799439011",
  linkedinMemberId: "linkedin-member-123",
  displayName: "Test Member",
  tokenExpiresAt: new Date("2026-10-20T00:00:00.000Z"),
  scopes: ["openid", "profile", "w_member_social"],
  status: "connected" as const,
};

describe("LinkedIn callback service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    consumeStateMock.mockResolvedValue({
      supabaseUserId: "supabase-user-123",
      workspaceId: "507f1f77bcf86cd799439011",
    });

    exchangeCodeMock.mockResolvedValue({
      access_token: "test-access-token",
      expires_in: 3600,
      scope: "openid profile w_member_social",
    });

    fetchProfileMock.mockResolvedValue({
      memberId: "linkedin-member-123",
      displayName: "Test Member",
    });

    saveConnectionMock.mockResolvedValue(connectionSummary);
  });

  it("consumes state, exchanges the code, verifies the profile, and saves the connection", async () => {
    const result = await completeLinkedInOAuthCallback({
      code: "authorization-code",
      state: "valid-state",
    });

    expect(consumeStateMock).toHaveBeenCalledWith({
      state: "valid-state",
    });

    expect(exchangeCodeMock).toHaveBeenCalledWith("authorization-code");
    expect(fetchProfileMock).toHaveBeenCalledWith("test-access-token");

    expect(saveConnectionMock).toHaveBeenCalledWith({
      authUser: {
        id: "supabase-user-123",
        email: null,
      },
      workspaceId: "507f1f77bcf86cd799439011",
      profile: {
        memberId: "linkedin-member-123",
        displayName: "Test Member",
      },
      tokens: {
        access_token: "test-access-token",
        expires_in: 3600,
        scope: "openid profile w_member_social",
      },
    });

    expect(result).toEqual(connectionSummary);
  });

  it("rejects an empty authorization code before consuming state", async () => {
    await expect(
      completeLinkedInOAuthCallback({
        code: " ",
        state: "valid-state",
      }),
    ).rejects.toMatchObject({
      name: "LinkedInCallbackError",
      statusCode: 400,
    });

    expect(consumeStateMock).not.toHaveBeenCalled();
  });

  it("rejects invalid OAuth state without exchanging the code", async () => {
    consumeStateMock.mockRejectedValue(new Error("Invalid state"));

    await expect(
      completeLinkedInOAuthCallback({
        code: "authorization-code",
        state: "invalid-state",
      }),
    ).rejects.toThrow("Invalid state");

    expect(exchangeCodeMock).not.toHaveBeenCalled();
  });

  it("maps known state errors to callback errors", async () => {
    const { LinkedInOAuthStateError } =
      await import("./linkedinOAuthStateService.js");

    consumeStateMock.mockRejectedValue(
      new LinkedInOAuthStateError("Invalid state", 400),
    );

    await expect(
      completeLinkedInOAuthCallback({
        code: "authorization-code",
        state: "invalid-state",
      }),
    ).rejects.toMatchObject({
      name: "LinkedInCallbackError",
      statusCode: 400,
    });

    expect(exchangeCodeMock).not.toHaveBeenCalled();
  });

  it("stops if token exchange fails", async () => {
    exchangeCodeMock.mockRejectedValue(new Error("Token exchange failed"));

    await expect(
      completeLinkedInOAuthCallback({
        code: "authorization-code",
        state: "valid-state",
      }),
    ).rejects.toThrow("Token exchange failed");

    expect(fetchProfileMock).not.toHaveBeenCalled();
    expect(saveConnectionMock).not.toHaveBeenCalled();
  });

  it("maps known token-exchange errors to callback errors", async () => {
    const { LinkedInTokenExchangeError } =
      await import("./linkedinTokenService.js");

    exchangeCodeMock.mockRejectedValue(
      new LinkedInTokenExchangeError("LinkedIn rejected the code", 502),
    );

    await expect(
      completeLinkedInOAuthCallback({
        code: "authorization-code",
        state: "valid-state",
      }),
    ).rejects.toMatchObject({
      name: "LinkedInCallbackError",
      statusCode: 502,
    });

    expect(fetchProfileMock).not.toHaveBeenCalled();
  });

  it("does not save a connection if profile lookup fails", async () => {
    fetchProfileMock.mockRejectedValue(new Error("Profile lookup failed"));

    await expect(
      completeLinkedInOAuthCallback({
        code: "authorization-code",
        state: "valid-state",
      }),
    ).rejects.toThrow("Profile lookup failed");

    expect(saveConnectionMock).not.toHaveBeenCalled();
  });

  it("maps known profile and connection errors to callback errors", async () => {
    const { LinkedInProfileLookupError } =
      await import("./linkedinProfileService.js");

    fetchProfileMock.mockRejectedValue(
      new LinkedInProfileLookupError("Profile unavailable", 502),
    );

    await expect(
      completeLinkedInOAuthCallback({
        code: "authorization-code",
        state: "valid-state",
      }),
    ).rejects.toMatchObject({
      name: "LinkedInCallbackError",
      statusCode: 502,
    });

    fetchProfileMock.mockResolvedValue({
      memberId: "linkedin-member-123",
    });

    const { LinkedInConnectionError } =
      await import("./linkedinConnectionService.js");

    saveConnectionMock.mockRejectedValue(
      new LinkedInConnectionError("Unable to save connection", 500),
    );

    await expect(
      completeLinkedInOAuthCallback({
        code: "authorization-code",
        state: "valid-state",
      }),
    ).rejects.toMatchObject({
      name: "LinkedInCallbackError",
      statusCode: 500,
    });
  });
});
