import { createHash } from "node:crypto";

import mongoose from "mongoose";

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSessionMock,
  findSessionMock,
  selectSessionMock,
  leanSessionMock,
  deleteSessionMock,
  selectDeletedSessionMock,
  leanDeletedSessionMock,
  encryptFacebookTokenMock,
  decryptFacebookTokenMock,
  getUserWorkspaceByIdMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  findSessionMock: vi.fn(),
  selectSessionMock: vi.fn(),
  leanSessionMock: vi.fn(),
  deleteSessionMock: vi.fn(),
  selectDeletedSessionMock: vi.fn(),
  leanDeletedSessionMock: vi.fn(),
  encryptFacebookTokenMock: vi.fn(),
  decryptFacebookTokenMock: vi.fn(),
  getUserWorkspaceByIdMock: vi.fn(),
}));

vi.mock("../../models/FacebookOAuthSession.js", () => ({
  default: {
    create: createSessionMock,
    findOne: findSessionMock,
    findOneAndDelete: deleteSessionMock,
  },
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: getUserWorkspaceByIdMock,
}));

vi.mock("./facebookTokenEncryptionService.js", () => ({
  encryptFacebookToken: encryptFacebookTokenMock,
  decryptFacebookToken: decryptFacebookTokenMock,

  FacebookTokenEncryptionError: class FacebookTokenEncryptionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "FacebookTokenEncryptionError";
    }
  },
}));

import {
  createFacebookOAuthSession,
  getFacebookOAuthSession,
  consumeFacebookOAuthSession,
  FacebookOAuthSessionError,
} from "./facebookOAuthSessionService.js";

import { FacebookTokenEncryptionError } from "./facebookTokenEncryptionService.js";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const USER_ID = "storm-user-123";

const FACEBOOK_USER_ID = "facebook-user-456";

const MOCK_PAGES = [
  {
    facebookPageId: "page-100",
    pageName: "Storm Official",
    pageAccessToken: "facebook-page-token-100",
    tasks: ["CREATE_CONTENT", "MANAGE"],
  },
  {
    facebookPageId: "page-200",
    pageName: "Storm Community",
    pageAccessToken: "facebook-page-token-200",
    tasks: ["CREATE_CONTENT"],
  },
];

function createValidInput() {
  return {
    supabaseUserId: USER_ID,
    workspaceId: WORKSPACE_ID,
    facebookUserId: FACEBOOK_USER_ID,
    pages: MOCK_PAGES.map((page) => ({
      ...page,
      tasks: [...page.tasks],
    })),
  };
}

describe("Facebook OAuth session creation service", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    createSessionMock.mockResolvedValue({});

    encryptFacebookTokenMock.mockImplementation(
      (token: string) => `encrypted:${token}`,
    );

    getUserWorkspaceByIdMock.mockResolvedValue({
      _id: WORKSPACE_ID,
    });

    leanSessionMock.mockResolvedValue(null);

    selectSessionMock.mockReturnValue({
      lean: leanSessionMock,
    });

    findSessionMock.mockReturnValue({
      select: selectSessionMock,
    });

    leanDeletedSessionMock.mockResolvedValue(null);

    selectDeletedSessionMock.mockReturnValue({
      lean: leanDeletedSessionMock,
    });

    deleteSessionMock.mockReturnValue({
      select: selectDeletedSessionMock,
    });

    decryptFacebookTokenMock.mockImplementation((encrypted: string) => {
      if (!encrypted.startsWith("encrypted:")) {
        throw new FacebookTokenEncryptionError(
          "Unable to decrypt Facebook access token.",
        );
      }

      return encrypted.slice("encrypted:".length);
    });
  });

  it("creates a session with the correct user and workspace", async () => {
    const result = await createFacebookOAuthSession(createValidInput());

    expect(createSessionMock).toHaveBeenCalledOnce();

    const saved = createSessionMock.mock.calls[0]?.[0];

    expect(saved.supabaseUserId).toBe(USER_ID);
    expect(saved.facebookUserId).toBe(FACEBOOK_USER_ID);

    expect(saved.workspaceId).toBeInstanceOf(mongoose.Types.ObjectId);

    expect(saved.workspaceId.toString()).toBe(WORKSPACE_ID);

    expect(result.sessionToken).toBeTruthy();
  });

  it("generates a 43-character random session token", async () => {
    const result = await createFacebookOAuthSession(createValidInput());

    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("generates different tokens for separate sessions", async () => {
    const first = await createFacebookOAuthSession(createValidInput());

    const second = await createFacebookOAuthSession(createValidInput());

    expect(first.sessionToken).not.toBe(second.sessionToken);
  });

  it("stores only the SHA-256 hash of the session token", async () => {
    const result = await createFacebookOAuthSession(createValidInput());

    const saved = createSessionMock.mock.calls[0]?.[0];

    const expectedHash = createHash("sha256")
      .update(result.sessionToken)
      .digest("hex");

    expect(saved.sessionHash).toBe(expectedHash);

    expect(saved.sessionHash).toMatch(/^[a-f0-9]{64}$/);

    expect(saved.sessionHash).not.toBe(result.sessionToken);

    expect(saved).not.toHaveProperty("sessionToken");
  });

  it("sets the session expiration to approximately 10 minutes", async () => {
    const before = Date.now();

    const result = await createFacebookOAuthSession(createValidInput());

    const after = Date.now();

    const expectedTtl = 10 * 60 * 1000;

    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + expectedTtl,
    );

    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + expectedTtl);

    const saved = createSessionMock.mock.calls[0]?.[0];

    expect(saved.expiresAt).toEqual(result.expiresAt);
  });

  it("encrypts every Page access token before persistence", async () => {
    await createFacebookOAuthSession(createValidInput());

    expect(encryptFacebookTokenMock).toHaveBeenCalledTimes(2);

    expect(encryptFacebookTokenMock).toHaveBeenCalledWith(
      "facebook-page-token-100",
    );

    expect(encryptFacebookTokenMock).toHaveBeenCalledWith(
      "facebook-page-token-200",
    );

    const saved = createSessionMock.mock.calls[0]?.[0];

    expect(saved.pages).toEqual([
      {
        facebookPageId: "page-100",
        pageName: "Storm Official",
        pageAccessTokenEncrypted: "encrypted:facebook-page-token-100",
        tasks: ["CREATE_CONTENT", "MANAGE"],
      },
      {
        facebookPageId: "page-200",
        pageName: "Storm Community",
        pageAccessTokenEncrypted: "encrypted:facebook-page-token-200",
        tasks: ["CREATE_CONTENT"],
      },
    ]);

    for (const page of saved.pages) {
      expect(page).not.toHaveProperty("pageAccessToken");
    }
  });

  it("returns only public Page metadata", async () => {
    const result = await createFacebookOAuthSession(createValidInput());

    expect(result.pages).toEqual([
      {
        facebookPageId: "page-100",
        pageName: "Storm Official",
        tasks: ["CREATE_CONTENT", "MANAGE"],
      },
      {
        facebookPageId: "page-200",
        pageName: "Storm Community",
        tasks: ["CREATE_CONTENT"],
      },
    ]);

    for (const page of result.pages) {
      expect(page).not.toHaveProperty("pageAccessToken");
      expect(page).not.toHaveProperty("pageAccessTokenEncrypted");
    }
  });

  it("supports sessions with no available Pages", async () => {
    const result = await createFacebookOAuthSession({
      ...createValidInput(),
      pages: [],
    });

    expect(result.pages).toEqual([]);

    expect(encryptFacebookTokenMock).not.toHaveBeenCalled();

    expect(createSessionMock).toHaveBeenCalledOnce();
  });

  it("rejects an invalid authenticated user", async () => {
    await expect(
      createFacebookOAuthSession({
        ...createValidInput(),
        supabaseUserId: " ",
      }),
    ).rejects.toMatchObject({
      name: "FacebookOAuthSessionError",
      statusCode: 401,
    });

    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid workspace ID", async () => {
    await expect(
      createFacebookOAuthSession({
        ...createValidInput(),
        workspaceId: "invalid-workspace",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid Facebook user ID", async () => {
    await expect(
      createFacebookOAuthSession({
        ...createValidInput(),
        facebookUserId: " ",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("rejects invalid Page data", async () => {
    const input = createValidInput();

    input.pages[0]!.pageAccessToken = "";

    await expect(createFacebookOAuthSession(input)).rejects.toMatchObject({
      statusCode: 400,
      message: "Facebook Page data is invalid.",
    });

    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate Facebook Pages", async () => {
    const input = createValidInput();

    input.pages[1]!.facebookPageId = input.pages[0]!.facebookPageId;

    await expect(createFacebookOAuthSession(input)).rejects.toMatchObject({
      statusCode: 400,
      message: "Duplicate Facebook Pages are not allowed.",
    });

    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("rejects invalid Page tasks", async () => {
    const input = createValidInput();

    input.pages[0]!.tasks = ["CREATE_CONTENT", 123 as unknown as string];

    await expect(createFacebookOAuthSession(input)).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("handles Facebook token encryption failures", async () => {
    encryptFacebookTokenMock.mockImplementation(() => {
      throw new FacebookTokenEncryptionError(
        "Facebook token encryption is not configured on the server.",
      );
    });

    await expect(
      createFacebookOAuthSession(createValidInput()),
    ).rejects.toMatchObject({
      name: "FacebookOAuthSessionError",
      statusCode: 503,
      message: "Facebook token encryption is unavailable.",
    });

    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("preserves unexpected encryption errors", async () => {
    encryptFacebookTokenMock.mockImplementation(() => {
      throw new Error("Unexpected encryption failure");
    });

    await expect(
      createFacebookOAuthSession(createValidInput()),
    ).rejects.toThrow("Unexpected encryption failure");

    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("propagates database failures", async () => {
    createSessionMock.mockRejectedValueOnce(new Error("Database unavailable"));

    await expect(
      createFacebookOAuthSession(createValidInput()),
    ).rejects.toThrow("Database unavailable");
  });

  it("returns a FacebookOAuthSessionError for invalid inputs", async () => {
    await expect(
      createFacebookOAuthSession({
        ...createValidInput(),
        workspaceId: "invalid",
      }),
    ).rejects.toBeInstanceOf(FacebookOAuthSessionError);
  });
});

describe("Facebook OAuth session retrieval", () => {
  const SESSION_TOKEN = "A".repeat(43);

  const AUTH_USER = {
    id: USER_ID,
    email: "storm-test@example.com",
  };

  const SESSION_EXPIRY = new Date(Date.now() + 5 * 60 * 1000);

  function createRetrievalInput() {
    return {
      sessionToken: SESSION_TOKEN,
      authUser: AUTH_USER,
      workspaceId: WORKSPACE_ID,
    };
  }

  function createStoredSession() {
    return {
      expiresAt: SESSION_EXPIRY,
      pages: [
        {
          facebookPageId: "page-100",
          pageName: "Storm Official",
          tasks: ["CREATE_CONTENT"],
          pageAccessTokenEncrypted: "encrypted-secret-100",
        },
        {
          facebookPageId: "page-200",
          pageName: "Storm Community",
          tasks: ["CREATE_CONTENT", "MANAGE"],
          pageAccessTokenEncrypted: "encrypted-secret-200",
        },
      ],
    };
  }

  it("returns Pages for an authorized user", async () => {
    leanSessionMock.mockResolvedValueOnce(createStoredSession());

    const result = await getFacebookOAuthSession(createRetrievalInput());

    expect(result.expiresAt).toEqual(SESSION_EXPIRY);

    expect(result.pages).toEqual([
      {
        facebookPageId: "page-100",
        pageName: "Storm Official",
        tasks: ["CREATE_CONTENT"],
      },
      {
        facebookPageId: "page-200",
        pageName: "Storm Community",
        tasks: ["CREATE_CONTENT", "MANAGE"],
      },
    ]);

    expect(getUserWorkspaceByIdMock).toHaveBeenCalledWith(
      AUTH_USER,
      WORKSPACE_ID,
    );
  });

  it("queries using the SHA-256 session hash", async () => {
    leanSessionMock.mockResolvedValueOnce(createStoredSession());

    await getFacebookOAuthSession(createRetrievalInput());

    const expectedHash = createHash("sha256")
      .update(SESSION_TOKEN)
      .digest("hex");

    expect(findSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionHash: expectedHash,
      }),
    );

    expect(findSessionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sessionHash: SESSION_TOKEN,
      }),
    );
  });

  it("restricts the query to the authenticated user and workspace", async () => {
    leanSessionMock.mockResolvedValueOnce(createStoredSession());

    await getFacebookOAuthSession(createRetrievalInput());

    expect(findSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseUserId: USER_ID,
        workspaceId: expect.any(mongoose.Types.ObjectId),
      }),
    );

    const query = findSessionMock.mock.calls[0]?.[0];

    expect(query.workspaceId.toString()).toBe(WORKSPACE_ID);
  });

  it("requires the session to be unexpired", async () => {
    leanSessionMock.mockResolvedValueOnce(createStoredSession());

    await getFacebookOAuthSession(createRetrievalInput());

    expect(findSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: {
          $gt: expect.any(Date),
        },
      }),
    );
  });

  it("selects only safe Page metadata", async () => {
    leanSessionMock.mockResolvedValueOnce(createStoredSession());

    await getFacebookOAuthSession(createRetrievalInput());

    expect(selectSessionMock).toHaveBeenCalledWith(
      "expiresAt pages.facebookPageId pages.pageName pages.tasks",
    );
  });

  it("never returns Facebook access tokens", async () => {
    leanSessionMock.mockResolvedValueOnce(createStoredSession());

    const result = await getFacebookOAuthSession(createRetrievalInput());

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("pageAccessToken");

    expect(serialized).not.toContain("encrypted-secret");
  });

  it("rejects invalid session tokens", async () => {
    await expect(
      getFacebookOAuthSession({
        ...createRetrievalInput(),
        sessionToken: "invalid-token",
      }),
    ).rejects.toMatchObject({
      name: "FacebookOAuthSessionError",
      statusCode: 400,
    });

    expect(findSessionMock).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    await expect(
      getFacebookOAuthSession({
        ...createRetrievalInput(),
        authUser: {
          id: "",
          email: null,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(findSessionMock).not.toHaveBeenCalled();
  });

  it("rejects invalid workspace IDs", async () => {
    await expect(
      getFacebookOAuthSession({
        ...createRetrievalInput(),
        workspaceId: "invalid",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(findSessionMock).not.toHaveBeenCalled();
  });

  it("denies access when the user does not own the workspace", async () => {
    getUserWorkspaceByIdMock.mockResolvedValueOnce(null);

    await expect(
      getFacebookOAuthSession(createRetrievalInput()),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Workspace access denied.",
    });

    expect(findSessionMock).not.toHaveBeenCalled();
  });

  it("rejects nonexistent or expired sessions", async () => {
    leanSessionMock.mockResolvedValueOnce(null);

    await expect(
      getFacebookOAuthSession(createRetrievalInput()),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Facebook OAuth session is invalid or expired.",
    });
  });

  it("rejects sessions belonging to another user or workspace", async () => {
    // MongoDB returns null when ownership filters do not match.
    leanSessionMock.mockResolvedValueOnce(null);

    await expect(
      getFacebookOAuthSession(createRetrievalInput()),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    const query = findSessionMock.mock.calls[0]?.[0];

    expect(query.supabaseUserId).toBe(USER_ID);

    expect(query.workspaceId.toString()).toBe(WORKSPACE_ID);
  });

  it("allows repeated retrieval without consuming the session", async () => {
    leanSessionMock.mockResolvedValue(createStoredSession());

    const first = await getFacebookOAuthSession(createRetrievalInput());

    const second = await getFacebookOAuthSession(createRetrievalInput());

    expect(first.pages).toEqual(second.pages);

    expect(findSessionMock).toHaveBeenCalledTimes(2);

    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("returns a typed session error", async () => {
    leanSessionMock.mockResolvedValueOnce(null);

    await expect(
      getFacebookOAuthSession(createRetrievalInput()),
    ).rejects.toBeInstanceOf(FacebookOAuthSessionError);
  });
});

describe("Facebook OAuth session consumption", () => {
  const SESSION_TOKEN = "B".repeat(43);

  const AUTH_USER = {
    id: USER_ID,
    email: "storm-test@example.com",
  };

  const SESSION_EXPIRY = new Date(Date.now() + 5 * 60 * 1000);

  function createConsumptionInput() {
    return {
      sessionToken: SESSION_TOKEN,
      authUser: AUTH_USER,
      workspaceId: WORKSPACE_ID,
    };
  }

  function createStoredSession() {
    return {
      facebookUserId: FACEBOOK_USER_ID,
      expiresAt: SESSION_EXPIRY,
      pages: [
        {
          facebookPageId: "page-100",
          pageName: "Storm Official",
          pageAccessTokenEncrypted: "encrypted:facebook-page-token-100",
          tasks: ["CREATE_CONTENT"],
        },
        {
          facebookPageId: "page-200",
          pageName: "Storm Community",
          pageAccessTokenEncrypted: "encrypted:facebook-page-token-200",
          tasks: ["CREATE_CONTENT", "MANAGE"],
        },
      ],
    };
  }

  it("atomically consumes a valid session", async () => {
    leanDeletedSessionMock.mockResolvedValueOnce(createStoredSession());

    const result = await consumeFacebookOAuthSession(createConsumptionInput());

    expect(deleteSessionMock).toHaveBeenCalledOnce();

    expect(result.facebookUserId).toBe(FACEBOOK_USER_ID);

    expect(result.pages).toHaveLength(2);
  });

  it("hashes the session token before querying MongoDB", async () => {
    leanDeletedSessionMock.mockResolvedValueOnce(createStoredSession());

    await consumeFacebookOAuthSession(createConsumptionInput());

    const expectedHash = createHash("sha256")
      .update(SESSION_TOKEN)
      .digest("hex");

    expect(deleteSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionHash: expectedHash,
      }),
    );

    expect(deleteSessionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sessionHash: SESSION_TOKEN,
      }),
    );
  });

  it("restricts consumption to the authenticated user and workspace", async () => {
    leanDeletedSessionMock.mockResolvedValueOnce(createStoredSession());

    await consumeFacebookOAuthSession(createConsumptionInput());

    const query = deleteSessionMock.mock.calls[0]?.[0];

    expect(query.supabaseUserId).toBe(USER_ID);

    expect(query.workspaceId).toBeInstanceOf(mongoose.Types.ObjectId);

    expect(query.workspaceId.toString()).toBe(WORKSPACE_ID);

    expect(getUserWorkspaceByIdMock).toHaveBeenCalledWith(
      AUTH_USER,
      WORKSPACE_ID,
    );
  });

  it("requires an unexpired session", async () => {
    leanDeletedSessionMock.mockResolvedValueOnce(createStoredSession());

    await consumeFacebookOAuthSession(createConsumptionInput());

    const query = deleteSessionMock.mock.calls[0]?.[0];

    expect(query.expiresAt).toEqual({
      $gt: expect.any(Date),
    });
  });

  it("selects encrypted Page credentials for backend decryption", async () => {
    leanDeletedSessionMock.mockResolvedValueOnce(createStoredSession());

    await consumeFacebookOAuthSession(createConsumptionInput());

    expect(selectDeletedSessionMock).toHaveBeenCalledWith(
      "facebookUserId pages.facebookPageId pages.pageName pages.pageAccessTokenEncrypted pages.tasks",
    );
  });

  it("decrypts Page access tokens after consuming the session", async () => {
    leanDeletedSessionMock.mockResolvedValueOnce(createStoredSession());

    const result = await consumeFacebookOAuthSession(createConsumptionInput());

    expect(decryptFacebookTokenMock).toHaveBeenCalledTimes(2);

    expect(decryptFacebookTokenMock).toHaveBeenCalledWith(
      "encrypted:facebook-page-token-100",
    );

    expect(decryptFacebookTokenMock).toHaveBeenCalledWith(
      "encrypted:facebook-page-token-200",
    );

    expect(result.pages).toEqual([
      {
        facebookPageId: "page-100",
        pageName: "Storm Official",
        pageAccessToken: "facebook-page-token-100",
        tasks: ["CREATE_CONTENT"],
      },
      {
        facebookPageId: "page-200",
        pageName: "Storm Community",
        pageAccessToken: "facebook-page-token-200",
        tasks: ["CREATE_CONTENT", "MANAGE"],
      },
    ]);
  });

  it("rejects an invalid session token", async () => {
    await expect(
      consumeFacebookOAuthSession({
        ...createConsumptionInput(),
        sessionToken: "invalid",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid Facebook OAuth session.",
    });

    expect(deleteSessionMock).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    await expect(
      consumeFacebookOAuthSession({
        ...createConsumptionInput(),
        authUser: {
          id: "",
          email: null,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(deleteSessionMock).not.toHaveBeenCalled();
  });

  it("rejects invalid workspace IDs", async () => {
    await expect(
      consumeFacebookOAuthSession({
        ...createConsumptionInput(),
        workspaceId: "invalid-workspace",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(deleteSessionMock).not.toHaveBeenCalled();
  });

  it("denies consumption without workspace access", async () => {
    getUserWorkspaceByIdMock.mockResolvedValueOnce(null);

    await expect(
      consumeFacebookOAuthSession(createConsumptionInput()),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Workspace access denied.",
    });

    expect(deleteSessionMock).not.toHaveBeenCalled();
  });

  it("rejects nonexistent or expired sessions", async () => {
    leanDeletedSessionMock.mockResolvedValueOnce(null);

    await expect(
      consumeFacebookOAuthSession(createConsumptionInput()),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Facebook OAuth session is invalid, expired, or already used.",
    });
  });

  it("prevents replay after the session is consumed", async () => {
    leanDeletedSessionMock
      .mockResolvedValueOnce(createStoredSession())
      .mockResolvedValueOnce(null);

    const first = await consumeFacebookOAuthSession(createConsumptionInput());

    expect(first.pages).toHaveLength(2);

    await expect(
      consumeFacebookOAuthSession(createConsumptionInput()),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(deleteSessionMock).toHaveBeenCalledTimes(2);
  });

  it("rejects Facebook token decryption failures", async () => {
    leanDeletedSessionMock.mockResolvedValueOnce(createStoredSession());

    decryptFacebookTokenMock.mockImplementationOnce(() => {
      throw new FacebookTokenEncryptionError(
        "Unable to decrypt Facebook access token.",
      );
    });

    await expect(
      consumeFacebookOAuthSession(createConsumptionInput()),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "Facebook Page credentials could not be decrypted.",
    });

    expect(deleteSessionMock).toHaveBeenCalledOnce();
  });

  it("preserves unexpected decryption errors", async () => {
    leanDeletedSessionMock.mockResolvedValueOnce(createStoredSession());

    decryptFacebookTokenMock.mockImplementationOnce(() => {
      throw new Error("Unexpected decryption failure");
    });

    await expect(
      consumeFacebookOAuthSession(createConsumptionInput()),
    ).rejects.toThrow("Unexpected decryption failure");
  });

  it("allows only one concurrent request to consume the session", async () => {
    leanDeletedSessionMock
      .mockResolvedValueOnce(createStoredSession())
      .mockResolvedValueOnce(null);

    const results = await Promise.allSettled([
      consumeFacebookOAuthSession(createConsumptionInput()),
      consumeFacebookOAuthSession(createConsumptionInput()),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");

    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    expect(rejected[0]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        statusCode: 404,
      }),
    });

    expect(deleteSessionMock).toHaveBeenCalledTimes(2);
  });
});
