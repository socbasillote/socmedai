import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

import { createHash } from "node:crypto";
import type { ClientSession } from "mongoose";

const {
  getUserWorkspaceByIdMock,
  findOneAndDeleteMock,
  selectMock,
  sessionMock,
  leanMock,
  updateOneMock,
  encryptFacebookTokenMock,
  decryptFacebookTokenMock,
} = vi.hoisted(() => ({
  getUserWorkspaceByIdMock: vi.fn(),
  findOneAndDeleteMock: vi.fn(),
  selectMock: vi.fn(),
  sessionMock: vi.fn(),
  leanMock: vi.fn(),
  updateOneMock: vi.fn(),
  encryptFacebookTokenMock: vi.fn(),
  decryptFacebookTokenMock: vi.fn(),
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: getUserWorkspaceByIdMock,
}));

vi.mock("../../models/FacebookOAuthSession.js", () => ({
  default: {
    findOneAndDelete: findOneAndDeleteMock,
  },
}));

vi.mock("../../models/FacebookConnection.js", () => ({
  default: {
    updateOne: updateOneMock,
  },
}));

vi.mock("./facebookTokenEncryptionService.js", () => ({
  encryptFacebookToken: encryptFacebookTokenMock,
  decryptFacebookToken: decryptFacebookTokenMock,
}));

import {
  FacebookPageConnectionError,
  validateFacebookPageConnectionRequest,
  claimFacebookOAuthSession,
  validateFacebookPageSelection,
  persistFacebookPageConnection,
} from "./facebookPageConnectionService.js";

const USER_ID = "storm-user-123";

const WORKSPACE_ID = new mongoose.Types.ObjectId().toString();

const AUTH_USER = {
  id: USER_ID,
  email: "storm-test@example.com",
};

const SESSION_TOKEN = "A".repeat(43);

function createValidInput() {
  return {
    sessionToken: SESSION_TOKEN,
    authUser: AUTH_USER,
    workspaceId: WORKSPACE_ID,
    selectedPageIds: ["123456789012345", "987654321098765"],
  };
}

describe("Facebook Page connection request validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    getUserWorkspaceByIdMock.mockResolvedValue({
      _id: WORKSPACE_ID,
    });

    leanMock.mockResolvedValue(null);

    sessionMock.mockReturnValue({
      lean: leanMock,
    });

    selectMock.mockReturnValue({
      session: sessionMock,
    });

    findOneAndDeleteMock.mockReturnValue({
      select: selectMock,
    });

    updateOneMock.mockResolvedValue({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 1,
    });

    decryptFacebookTokenMock.mockReturnValue("plaintext-facebook-page-token");

    encryptFacebookTokenMock.mockReturnValue(
      "new-encrypted-facebook-page-token",
    );
  });

  it("accepts a valid connection request", async () => {
    const result =
      await validateFacebookPageConnectionRequest(createValidInput());

    expect(result.sessionToken).toBe(SESSION_TOKEN);

    expect(result.authUser).toEqual(AUTH_USER);

    expect(result.workspaceId).toBeInstanceOf(mongoose.Types.ObjectId);

    expect(result.workspaceId.toString()).toBe(WORKSPACE_ID);

    expect(result.selectedPageIds).toEqual([
      "123456789012345",
      "987654321098765",
    ]);
  });

  it("verifies workspace ownership", async () => {
    await validateFacebookPageConnectionRequest(createValidInput());

    expect(getUserWorkspaceByIdMock).toHaveBeenCalledWith(
      AUTH_USER,
      WORKSPACE_ID,
    );
  });

  it("rejects an empty authenticated user ID", async () => {
    await expect(
      validateFacebookPageConnectionRequest({
        ...createValidInput(),
        authUser: {
          id: "",
          email: null,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Authentication is required.",
    });

    expect(getUserWorkspaceByIdMock).not.toHaveBeenCalled();
  });

  it("rejects invalid workspace IDs", async () => {
    await expect(
      validateFacebookPageConnectionRequest({
        ...createValidInput(),
        workspaceId: "invalid-workspace",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "A valid workspace is required.",
    });

    expect(getUserWorkspaceByIdMock).not.toHaveBeenCalled();
  });

  it("rejects malformed OAuth session tokens", async () => {
    await expect(
      validateFacebookPageConnectionRequest({
        ...createValidInput(),
        sessionToken: "invalid-token",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid Facebook OAuth session.",
    });

    expect(getUserWorkspaceByIdMock).not.toHaveBeenCalled();
  });

  it("rejects empty Page selections", async () => {
    await expect(
      validateFacebookPageConnectionRequest({
        ...createValidInput(),
        selectedPageIds: [],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Select at least one Facebook Page.",
    });

    expect(getUserWorkspaceByIdMock).not.toHaveBeenCalled();
  });

  it("rejects selections containing more than 100 Pages", async () => {
    const selectedPageIds = Array.from({ length: 101 }, (_, index) =>
      String(index + 1),
    );

    await expect(
      validateFacebookPageConnectionRequest({
        ...createValidInput(),
        selectedPageIds,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Too many Facebook Pages selected.",
    });

    expect(getUserWorkspaceByIdMock).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", ""],
    ["alphabetic", "page-123"],
    ["spaces", " 123 "],
    ["decimal", "123.45"],
    ["negative", "-123"],
    ["special characters", "123; DROP TABLE"],
  ])("rejects %s Page IDs", async (_description, pageId) => {
    await expect(
      validateFacebookPageConnectionRequest({
        ...createValidInput(),
        selectedPageIds: [pageId],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid Facebook Page ID.",
    });

    expect(getUserWorkspaceByIdMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate Page IDs", async () => {
    await expect(
      validateFacebookPageConnectionRequest({
        ...createValidInput(),
        selectedPageIds: ["123456789012345", "123456789012345"],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Duplicate Facebook Pages are not allowed.",
    });

    expect(getUserWorkspaceByIdMock).not.toHaveBeenCalled();
  });

  it("denies access to workspaces not owned by the user", async () => {
    getUserWorkspaceByIdMock.mockResolvedValueOnce(null);

    await expect(
      validateFacebookPageConnectionRequest(createValidInput()),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Workspace access denied.",
    });
  });

  it("returns a FacebookPageConnectionError for invalid input", async () => {
    await expect(
      validateFacebookPageConnectionRequest({
        ...createValidInput(),
        sessionToken: "invalid",
      }),
    ).rejects.toBeInstanceOf(FacebookPageConnectionError);
  });

  it("does not mutate the selected Page IDs", async () => {
    const input = createValidInput();

    const originalSelection = [...input.selectedPageIds];

    const result = await validateFacebookPageConnectionRequest(input);

    expect(input.selectedPageIds).toEqual(originalSelection);

    expect(result.selectedPageIds).toEqual(originalSelection);

    expect(result.selectedPageIds).not.toBe(input.selectedPageIds);
  });

  it("accepts exactly 100 unique Pages", async () => {
    const selectedPageIds = Array.from({ length: 100 }, (_, index) =>
      String(index + 1),
    );

    const result = await validateFacebookPageConnectionRequest({
      ...createValidInput(),
      selectedPageIds,
    });

    expect(result.selectedPageIds).toHaveLength(100);
  });

  it("does not consume OAuth sessions or write connections", async () => {
    await validateFacebookPageConnectionRequest(createValidInput());

    expect(getUserWorkspaceByIdMock).toHaveBeenCalledOnce();

    // The validation service must not call session
    // consumption or connection persistence.
    // Those operations belong to later steps.
  });

  it("rejects alphabetic Facebook Page IDs", async () => {
    await expect(
      validateFacebookPageConnectionRequest({
        ...createValidInput(),
        selectedPageIds: ["page-123"],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid Facebook Page ID.",
    });

    expect(getUserWorkspaceByIdMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate Facebook Page IDs", async () => {
    await expect(
      validateFacebookPageConnectionRequest({
        ...createValidInput(),
        selectedPageIds: ["123456789012345", "123456789012345"],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Duplicate Facebook Pages are not allowed.",
    });

    expect(getUserWorkspaceByIdMock).not.toHaveBeenCalled();
  });
});

describe("Facebook OAuth transactional session claiming", () => {
  const SESSION_TOKEN = "B".repeat(43);

  const AUTH_USER = {
    id: USER_ID,
    email: "storm-test@example.com",
  };

  const WORKSPACE_OBJECT_ID = new mongoose.Types.ObjectId(WORKSPACE_ID);

  const activeMongoSession = {
    inTransaction: vi.fn(() => true),
  } as unknown as ClientSession;

  function createClaimInput() {
    return {
      sessionToken: SESSION_TOKEN,
      authUser: AUTH_USER,
      workspaceId: WORKSPACE_OBJECT_ID,
      mongoSession: activeMongoSession,
    };
  }

  function createStoredSession() {
    return {
      facebookUserId: "facebook-user-123",
      pages: [
        {
          facebookPageId: "123456789012345",
          pageName: "Storm Official",
          pageAccessTokenEncrypted: "encrypted-facebook-token-1",
          tasks: ["CREATE_CONTENT"],
        },
        {
          facebookPageId: "987654321098765",
          pageName: "Storm Community",
          pageAccessTokenEncrypted: "encrypted-facebook-token-2",
          tasks: ["CREATE_CONTENT", "MANAGE"],
        },
      ],
    };
  }

  beforeEach(() => {
    vi.mocked(activeMongoSession.inTransaction).mockReturnValue(true);
  });

  it("claims a valid OAuth session", async () => {
    leanMock.mockResolvedValueOnce(createStoredSession());

    const result = await claimFacebookOAuthSession(createClaimInput());

    expect(findOneAndDeleteMock).toHaveBeenCalledOnce();

    expect(result.facebookUserId).toBe("facebook-user-123");

    expect(result.pages).toHaveLength(2);
  });

  it("hashes the OAuth session token with SHA-256", async () => {
    leanMock.mockResolvedValueOnce(createStoredSession());

    await claimFacebookOAuthSession(createClaimInput());

    const expectedHash = createHash("sha256")
      .update(SESSION_TOKEN)
      .digest("hex");

    expect(findOneAndDeleteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionHash: expectedHash,
      }),
    );

    expect(findOneAndDeleteMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sessionHash: SESSION_TOKEN,
      }),
    );
  });

  it("restricts the claim to the authenticated user and workspace", async () => {
    leanMock.mockResolvedValueOnce(createStoredSession());

    await claimFacebookOAuthSession(createClaimInput());

    const query = findOneAndDeleteMock.mock.calls[0]?.[0];

    expect(query.supabaseUserId).toBe(USER_ID);

    expect(query.workspaceId).toBe(WORKSPACE_OBJECT_ID);
  });

  it("requires the OAuth session to be unexpired", async () => {
    leanMock.mockResolvedValueOnce(createStoredSession());

    await claimFacebookOAuthSession(createClaimInput());

    const query = findOneAndDeleteMock.mock.calls[0]?.[0];

    expect(query.expiresAt).toEqual({
      $gt: expect.any(Date),
    });
  });

  it("binds the MongoDB operation to the provided transaction", async () => {
    leanMock.mockResolvedValueOnce(createStoredSession());

    await claimFacebookOAuthSession(createClaimInput());

    expect(sessionMock).toHaveBeenCalledWith(activeMongoSession);
  });

  it("selects the encrypted Page credentials required for persistence", async () => {
    leanMock.mockResolvedValueOnce(createStoredSession());

    await claimFacebookOAuthSession(createClaimInput());

    expect(selectMock).toHaveBeenCalledWith(
      "facebookUserId pages.facebookPageId pages.pageName pages.pageAccessTokenEncrypted pages.tasks",
    );
  });

  it("returns encrypted Page credentials without decrypting them", async () => {
    leanMock.mockResolvedValueOnce(createStoredSession());

    const result = await claimFacebookOAuthSession(createClaimInput());

    expect(result.pages).toEqual([
      {
        facebookPageId: "123456789012345",
        pageName: "Storm Official",
        pageAccessTokenEncrypted: "encrypted-facebook-token-1",
        tasks: ["CREATE_CONTENT"],
      },
      {
        facebookPageId: "987654321098765",
        pageName: "Storm Community",
        pageAccessTokenEncrypted: "encrypted-facebook-token-2",
        tasks: ["CREATE_CONTENT", "MANAGE"],
      },
    ]);

    expect(JSON.stringify(result)).not.toContain('pageAccessToken":');
  });

  it("rejects invalid OAuth session tokens", async () => {
    await expect(
      claimFacebookOAuthSession({
        ...createClaimInput(),
        sessionToken: "invalid",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid Facebook OAuth session.",
    });

    expect(findOneAndDeleteMock).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    await expect(
      claimFacebookOAuthSession({
        ...createClaimInput(),
        authUser: {
          id: "",
          email: null,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(findOneAndDeleteMock).not.toHaveBeenCalled();
  });

  it("requires a valid workspace ObjectId", async () => {
    await expect(
      claimFacebookOAuthSession({
        ...createClaimInput(),
        workspaceId: "invalid" as unknown as mongoose.Types.ObjectId,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(findOneAndDeleteMock).not.toHaveBeenCalled();
  });

  it("requires an active MongoDB transaction", async () => {
    vi.mocked(activeMongoSession.inTransaction).mockReturnValue(false);

    await expect(
      claimFacebookOAuthSession(createClaimInput()),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "An active database transaction is required.",
    });

    expect(findOneAndDeleteMock).not.toHaveBeenCalled();
  });

  it("rejects missing or previously consumed sessions", async () => {
    leanMock.mockResolvedValueOnce(null);

    await expect(
      claimFacebookOAuthSession(createClaimInput()),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Facebook OAuth session is invalid, expired, or already used.",
    });
  });

  it("propagates MongoDB errors", async () => {
    const databaseError = new Error("MongoDB write conflict");

    leanMock.mockRejectedValueOnce(databaseError);

    await expect(claimFacebookOAuthSession(createClaimInput())).rejects.toBe(
      databaseError,
    );
  });

  it("does not mutate the stored Page data", async () => {
    const storedSession = createStoredSession();

    leanMock.mockResolvedValueOnce(storedSession);

    const result = await claimFacebookOAuthSession(createClaimInput());

    expect(result.pages).not.toBe(storedSession.pages);

    expect(result.pages[0]?.tasks).not.toBe(storedSession.pages[0]?.tasks);

    expect(storedSession.pages[0]?.tasks).toEqual(["CREATE_CONTENT"]);
  });

  it("returns a typed error for a missing session", async () => {
    leanMock.mockResolvedValueOnce(null);

    await expect(
      claimFacebookOAuthSession(createClaimInput()),
    ).rejects.toBeInstanceOf(FacebookPageConnectionError);
  });
});

describe("Facebook Page selection validation", () => {
  const PAGE_A = "123456789012345";
  const PAGE_B = "987654321098765";
  const PAGE_C = "555666777888999";

  function createClaimedSession() {
    return {
      facebookUserId: "facebook-user-123",
      pages: [
        {
          facebookPageId: PAGE_A,
          pageName: "Storm Official",
          pageAccessTokenEncrypted: "encrypted-token-a",
          tasks: ["CREATE_CONTENT", "MANAGE"],
        },
        {
          facebookPageId: PAGE_B,
          pageName: "Storm Community",
          pageAccessTokenEncrypted: "encrypted-token-b",
          tasks: ["CREATE_CONTENT"],
        },
        {
          facebookPageId: PAGE_C,
          pageName: "Storm Analytics",
          pageAccessTokenEncrypted: "encrypted-token-c",
          tasks: ["ANALYZE"],
        },
      ],
    };
  }

  it("accepts a valid single Page selection", () => {
    const result = validateFacebookPageSelection({
      selectedPageIds: [PAGE_A],
      claimedSession: createClaimedSession(),
    });

    expect(result).toHaveLength(1);

    expect(result[0]).toEqual({
      facebookPageId: PAGE_A,
      pageName: "Storm Official",
      pageAccessTokenEncrypted: "encrypted-token-a",
      tasks: ["CREATE_CONTENT", "MANAGE"],
    });
  });

  it("accepts multiple Pages with publishing permission", () => {
    const result = validateFacebookPageSelection({
      selectedPageIds: [PAGE_A, PAGE_B],
      claimedSession: createClaimedSession(),
    });

    expect(result.map((page) => page.facebookPageId)).toEqual([PAGE_A, PAGE_B]);
  });

  it("preserves the user's selection order", () => {
    const result = validateFacebookPageSelection({
      selectedPageIds: [PAGE_B, PAGE_A],
      claimedSession: createClaimedSession(),
    });

    expect(result.map((page) => page.facebookPageId)).toEqual([PAGE_B, PAGE_A]);
  });

  it("rejects Pages not discovered during OAuth", () => {
    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [PAGE_A, "111222333444555"],
        claimedSession: createClaimedSession(),
      }),
    ).toThrow(
      "One or more selected Facebook Pages are not available in this OAuth session.",
    );
  });

  it("rejects Pages without CREATE_CONTENT permission", () => {
    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [PAGE_C],
        claimedSession: createClaimedSession(),
      }),
    ).toThrow(
      "One or more selected Facebook Pages do not have publishing permission.",
    );
  });

  it("returns status 403 for missing publishing permission", () => {
    try {
      validateFacebookPageSelection({
        selectedPageIds: [PAGE_C],
        claimedSession: createClaimedSession(),
      });

      throw new Error("Expected validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(FacebookPageConnectionError);

      expect(error).toMatchObject({
        statusCode: 403,
      });
    }
  });

  it("rejects an empty selection", () => {
    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [],
        claimedSession: createClaimedSession(),
      }),
    ).toThrow("Invalid Facebook Page selection.");
  });

  it("rejects more than 100 selected Pages", () => {
    const selectedPageIds = Array.from({ length: 101 }, (_, index) =>
      String(index + 1),
    );

    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds,
        claimedSession: createClaimedSession(),
      }),
    ).toThrow("Invalid Facebook Page selection.");
  });

  it.each([
    ["empty", ""],
    ["alphabetic", "page-123"],
    ["spaces", " 123 "],
    ["decimal", "123.45"],
    ["negative", "-123"],
  ])("rejects %s Page IDs", (_description, pageId) => {
    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [pageId],
        claimedSession: createClaimedSession(),
      }),
    ).toThrow("Invalid Facebook Page selection.");
  });

  it("rejects duplicate selected Page IDs", () => {
    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [PAGE_A, PAGE_A],
        claimedSession: createClaimedSession(),
      }),
    ).toThrow("Duplicate Facebook Pages are not allowed.");
  });

  it("rejects missing OAuth session data", () => {
    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [PAGE_A],
        claimedSession: null as unknown as ReturnType<
          typeof createClaimedSession
        >,
      }),
    ).toThrow("Facebook OAuth session contains no valid Pages.");
  });

  it("rejects OAuth sessions without a Pages array", () => {
    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [PAGE_A],
        claimedSession: {
          facebookUserId: "facebook-user-123",
          pages: null,
        } as unknown as ReturnType<typeof createClaimedSession>,
      }),
    ).toThrow("Facebook OAuth session contains no valid Pages.");
  });

  it("rejects discovered Pages with malformed IDs", () => {
    const claimedSession = createClaimedSession();

    claimedSession.pages[0]!.facebookPageId = "page-invalid";

    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [PAGE_B],
        claimedSession,
      }),
    ).toThrow("Facebook OAuth session contains invalid Page data.");
  });

  it("rejects discovered Pages without encrypted tokens", () => {
    const claimedSession = createClaimedSession();

    claimedSession.pages[0]!.pageAccessTokenEncrypted = "";

    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [PAGE_B],
        claimedSession,
      }),
    ).toThrow("Facebook OAuth session contains invalid Page data.");
  });

  it("rejects discovered Pages with invalid tasks", () => {
    const claimedSession = createClaimedSession();

    claimedSession.pages[0]!.tasks = [
      "CREATE_CONTENT",
      123 as unknown as string,
    ];

    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [PAGE_A],
        claimedSession,
      }),
    ).toThrow("Facebook OAuth session contains invalid Page data.");
  });

  it("rejects duplicate Pages inside the OAuth session", () => {
    const claimedSession = createClaimedSession();

    claimedSession.pages[1]!.facebookPageId = PAGE_A;

    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [PAGE_A],
        claimedSession,
      }),
    ).toThrow("Facebook OAuth session contains duplicate Pages.");
  });

  it("does not mutate discovered Page data", () => {
    const claimedSession = createClaimedSession();

    const originalTasks = [...claimedSession.pages[0]!.tasks];

    const result = validateFacebookPageSelection({
      selectedPageIds: [PAGE_A],
      claimedSession,
    });

    expect(result[0]!.tasks).toEqual(originalTasks);

    expect(result[0]!.tasks).not.toBe(claimedSession.pages[0]!.tasks);

    expect(claimedSession.pages[0]!.tasks).toEqual(originalTasks);
  });

  it("returns only the selected Pages", () => {
    const result = validateFacebookPageSelection({
      selectedPageIds: [PAGE_B],
      claimedSession: createClaimedSession(),
    });

    expect(result).toHaveLength(1);

    expect(result[0]!.facebookPageId).toBe(PAGE_B);

    expect(result.some((page) => page.facebookPageId === PAGE_A)).toBe(false);
  });

  it("keeps Page credentials encrypted", () => {
    const result = validateFacebookPageSelection({
      selectedPageIds: [PAGE_A],
      claimedSession: createClaimedSession(),
    });

    expect(result[0]!.pageAccessTokenEncrypted).toBe("encrypted-token-a");

    expect(result[0]).not.toHaveProperty("pageAccessToken");
  });

  it("rejects an invalid Page even when other selected Pages are valid", () => {
    expect(() =>
      validateFacebookPageSelection({
        selectedPageIds: [PAGE_A, PAGE_C],
        claimedSession: createClaimedSession(),
      }),
    ).toThrow(
      "One or more selected Facebook Pages do not have publishing permission.",
    );
  });
});

describe("Facebook Page connection persistence", () => {
  const WORKSPACE_OBJECT_ID = new mongoose.Types.ObjectId(WORKSPACE_ID);

  const activeMongoSession = {
    inTransaction: vi.fn(() => true),
  } as unknown as ClientSession;

  function createValidPage() {
    return {
      facebookPageId: "123456789012345",
      pageName: "Storm Official",
      pageAccessTokenEncrypted: "temporary-encrypted-facebook-token",
      tasks: ["CREATE_CONTENT", "MANAGE"],
    };
  }

  function createPersistenceInput() {
    return {
      workspaceId: WORKSPACE_OBJECT_ID,
      connectedByUserId: USER_ID,
      facebookUserId: "facebook-user-123",
      page: createValidPage(),
      mongoSession: activeMongoSession,
    };
  }

  beforeEach(() => {
    vi.mocked(activeMongoSession.inTransaction).mockReturnValue(true);
  });

  it("persists a valid Facebook Page connection", async () => {
    const result = await persistFacebookPageConnection(
      createPersistenceInput(),
    );

    expect(updateOneMock).toHaveBeenCalledOnce();

    expect(result).toEqual({
      facebookPageId: "123456789012345",
      pageName: "Storm Official",
      status: "connected",
    });
  });

  it("decrypts the temporary OAuth Page token", async () => {
    await persistFacebookPageConnection(createPersistenceInput());

    expect(decryptFacebookTokenMock).toHaveBeenCalledWith(
      "temporary-encrypted-facebook-token",
    );
  });

  it("re-encrypts the Page token before persistence", async () => {
    await persistFacebookPageConnection(createPersistenceInput());

    expect(encryptFacebookTokenMock).toHaveBeenCalledWith(
      "plaintext-facebook-page-token",
    );

    const update = updateOneMock.mock.calls[0]?.[1];

    expect(update.$set.pageAccessTokenEncrypted).toBe(
      "new-encrypted-facebook-page-token",
    );

    expect(update.$set.pageAccessTokenEncrypted).not.toBe(
      "plaintext-facebook-page-token",
    );
  });

  it("uses workspace and Page ID as the connection identity", async () => {
    await persistFacebookPageConnection(createPersistenceInput());

    const filter = updateOneMock.mock.calls[0]?.[0];

    expect(filter).toEqual({
      workspaceId: WORKSPACE_OBJECT_ID,
      facebookPageId: "123456789012345",
    });
  });

  it("saves the expected connection metadata", async () => {
    await persistFacebookPageConnection(createPersistenceInput());

    const update = updateOneMock.mock.calls[0]?.[1];

    expect(update.$set).toEqual({
      connectedByUserId: USER_ID,
      facebookUserId: "facebook-user-123",
      pageName: "Storm Official",
      pageAccessTokenEncrypted: "new-encrypted-facebook-page-token",
      status: "connected",
    });
  });

  it("does not confuse Facebook Page tasks with OAuth scopes", async () => {
    await persistFacebookPageConnection(createPersistenceInput());

    const update = updateOneMock.mock.calls[0]?.[1];

    expect(update.$setOnInsert).toEqual({
      scopes: [],
    });

    expect(update.$set.scopes).toBeUndefined();

    expect(update.$set.tasks).toBeUndefined();
  });

  it("uses upsert to support new connections and reconnections", async () => {
    await persistFacebookPageConnection(createPersistenceInput());

    const options = updateOneMock.mock.calls[0]?.[2];

    expect(options).toMatchObject({
      upsert: true,
      runValidators: true,
    });
  });

  it("binds the write to the supplied MongoDB transaction", async () => {
    await persistFacebookPageConnection(createPersistenceInput());

    const options = updateOneMock.mock.calls[0]?.[2];

    expect(options.session).toBe(activeMongoSession);
  });

  it("returns no access tokens or encrypted credentials", async () => {
    const result = await persistFacebookPageConnection(
      createPersistenceInput(),
    );

    expect(result).not.toHaveProperty("pageAccessToken");

    expect(result).not.toHaveProperty("pageAccessTokenEncrypted");

    expect(JSON.stringify(result)).not.toContain("facebook-page-token");
  });

  it("rejects requests without an active transaction", async () => {
    vi.mocked(activeMongoSession.inTransaction).mockReturnValue(false);

    await expect(
      persistFacebookPageConnection(createPersistenceInput()),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "An active database transaction is required.",
    });

    expect(updateOneMock).not.toHaveBeenCalled();
    expect(decryptFacebookTokenMock).not.toHaveBeenCalled();
  });

  it("rejects invalid workspace IDs", async () => {
    await expect(
      persistFacebookPageConnection({
        ...createPersistenceInput(),
        workspaceId: "invalid" as unknown as mongoose.Types.ObjectId,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "A valid workspace is required.",
    });

    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("rejects missing connection user IDs", async () => {
    await expect(
      persistFacebookPageConnection({
        ...createPersistenceInput(),
        connectedByUserId: "",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid Facebook connection identity.",
    });

    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("rejects missing Facebook user IDs", async () => {
    await expect(
      persistFacebookPageConnection({
        ...createPersistenceInput(),
        facebookUserId: "",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid Facebook connection identity.",
    });

    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("rejects malformed Facebook Page IDs", async () => {
    await expect(
      persistFacebookPageConnection({
        ...createPersistenceInput(),
        page: {
          ...createValidPage(),
          facebookPageId: "page-invalid",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid Facebook Page connection data.",
    });

    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("rejects Pages without CREATE_CONTENT permission", async () => {
    await expect(
      persistFacebookPageConnection({
        ...createPersistenceInput(),
        page: {
          ...createValidPage(),
          tasks: ["ANALYZE"],
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid Facebook Page connection data.",
    });

    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("rejects missing encrypted Page tokens", async () => {
    await expect(
      persistFacebookPageConnection({
        ...createPersistenceInput(),
        page: {
          ...createValidPage(),
          pageAccessTokenEncrypted: "",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid Facebook Page connection data.",
    });

    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("propagates token decryption errors", async () => {
    const encryptionError = new Error("Facebook token decryption failed");

    decryptFacebookTokenMock.mockImplementationOnce(() => {
      throw encryptionError;
    });

    await expect(
      persistFacebookPageConnection(createPersistenceInput()),
    ).rejects.toBe(encryptionError);

    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("propagates token encryption errors", async () => {
    const encryptionError = new Error("Facebook token encryption failed");

    encryptFacebookTokenMock.mockImplementationOnce(() => {
      throw encryptionError;
    });

    await expect(
      persistFacebookPageConnection(createPersistenceInput()),
    ).rejects.toBe(encryptionError);

    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("propagates MongoDB write failures", async () => {
    const databaseError = new Error("MongoDB transaction write failed");

    updateOneMock.mockRejectedValueOnce(databaseError);

    await expect(
      persistFacebookPageConnection(createPersistenceInput()),
    ).rejects.toBe(databaseError);
  });

  it("does not mutate the selected Page", async () => {
    const input = createPersistenceInput();

    const originalPage = {
      ...input.page,
      tasks: [...input.page.tasks],
    };

    await persistFacebookPageConnection(input);

    expect(input.page).toEqual(originalPage);
  });

  it("supports reconnecting an existing Page", async () => {
    updateOneMock.mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
    });

    const result = await persistFacebookPageConnection(
      createPersistenceInput(),
    );

    expect(result.status).toBe("connected");

    expect(updateOneMock).toHaveBeenCalledOnce();

    expect(updateOneMock.mock.calls[0]?.[2]).toMatchObject({
      upsert: true,
      session: activeMongoSession,
    });
  });
});
