import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import type { ClientSession } from "mongoose";

const {
  transactionMock,
  getUserWorkspaceByIdMock,
  findOneAndDeleteMock,
  selectMock,
  sessionMock,
  leanMock,
  updateOneMock,
  encryptFacebookTokenMock,
  decryptFacebookTokenMock,
} = vi.hoisted(() => ({
  transactionMock: vi.fn(),
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
  connectFacebookPages,
  FacebookPageConnectionError,
} from "./facebookPageConnectionService.js";

const WORKSPACE_ID = new mongoose.Types.ObjectId().toString();

const AUTH_USER = {
  id: "storm-user-123",
  email: "storm-test@example.com",
};

const SESSION_TOKEN = "A".repeat(43);

const PAGE_A = "123456789012345";
const PAGE_B = "987654321098765";
const PAGE_C = "555666777888999";

const mongoSession = {
  inTransaction: vi.fn(() => true),
} as unknown as ClientSession;

function createInput(selectedPageIds: string[] = [PAGE_A]) {
  return {
    sessionToken: SESSION_TOKEN,
    authUser: AUTH_USER,
    workspaceId: WORKSPACE_ID,
    selectedPageIds,
  };
}

function createStoredOAuthSession() {
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

describe("Facebook Page connection orchestration", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(mongoSession.inTransaction).mockReturnValue(true);

    getUserWorkspaceByIdMock.mockResolvedValue({
      _id: WORKSPACE_ID,
    });

    transactionMock.mockImplementation(
      async (callback: (session: ClientSession) => Promise<unknown>) =>
        callback(mongoSession),
    );

    // Spy on the actual Mongoose connection object.
    vi.spyOn(mongoose.connection, "transaction").mockImplementation(
      transactionMock,
    );

    leanMock.mockResolvedValue(createStoredOAuthSession());

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

    decryptFacebookTokenMock.mockImplementation(
      (encrypted: string) => `decrypted:${encrypted}`,
    );

    encryptFacebookTokenMock.mockImplementation(
      (plaintext: string) => `reencrypted:${plaintext}`,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("connects a single Facebook Page", async () => {
    const result = await connectFacebookPages(createInput());

    expect(result).toEqual({
      connections: [
        {
          facebookPageId: PAGE_A,
          pageName: "Storm Official",
          status: "connected",
        },
      ],
    });

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(findOneAndDeleteMock).toHaveBeenCalledOnce();
    expect(updateOneMock).toHaveBeenCalledOnce();
  });

  it("connects multiple selected Facebook Pages", async () => {
    const result = await connectFacebookPages(createInput([PAGE_A, PAGE_B]));

    expect(result.connections).toHaveLength(2);

    expect(result.connections.map((page) => page.facebookPageId)).toEqual([
      PAGE_A,
      PAGE_B,
    ]);

    expect(updateOneMock).toHaveBeenCalledTimes(2);
  });

  it("validates workspace ownership before starting a transaction", async () => {
    getUserWorkspaceByIdMock.mockResolvedValueOnce(null);

    await expect(connectFacebookPages(createInput())).rejects.toMatchObject({
      statusCode: 403,
      message: "Workspace access denied.",
    });

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects malformed requests before starting a transaction", async () => {
    await expect(
      connectFacebookPages({
        ...createInput(),
        sessionToken: "invalid",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("claims the OAuth session inside the transaction", async () => {
    await connectFacebookPages(createInput());

    expect(sessionMock).toHaveBeenCalledWith(mongoSession);

    expect(findOneAndDeleteMock).toHaveBeenCalledOnce();
  });

  it("binds connection persistence to the same transaction", async () => {
    await connectFacebookPages(createInput());

    const options = updateOneMock.mock.calls[0]?.[2];

    expect(options.session).toBe(mongoSession);
  });

  it("preserves the selected Page order", async () => {
    const result = await connectFacebookPages(createInput([PAGE_B, PAGE_A]));

    expect(result.connections.map((page) => page.facebookPageId)).toEqual([
      PAGE_B,
      PAGE_A,
    ]);

    expect(updateOneMock.mock.calls[0]?.[0].facebookPageId).toBe(PAGE_B);

    expect(updateOneMock.mock.calls[1]?.[0].facebookPageId).toBe(PAGE_A);
  });

  it("rejects Pages not present in the OAuth session", async () => {
    await expect(
      connectFacebookPages(createInput([PAGE_A, "111222333444555"])),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("rejects Pages without publishing permission", async () => {
    await expect(
      connectFacebookPages(createInput([PAGE_C])),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("rejects previously consumed OAuth sessions", async () => {
    leanMock.mockResolvedValueOnce(null);

    await expect(connectFacebookPages(createInput())).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("returns no Facebook access tokens", async () => {
    const result = await connectFacebookPages(createInput([PAGE_A, PAGE_B]));

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("pageAccessToken");
    expect(serialized).not.toContain("encrypted-token");
    expect(serialized).not.toContain("decrypted:");
    expect(serialized).not.toContain("reencrypted:");
  });

  it("encrypts each selected Page token before persistence", async () => {
    await connectFacebookPages(createInput([PAGE_A, PAGE_B]));

    expect(decryptFacebookTokenMock).toHaveBeenCalledTimes(2);
    expect(encryptFacebookTokenMock).toHaveBeenCalledTimes(2);

    const firstUpdate = updateOneMock.mock.calls[0]?.[1];
    const secondUpdate = updateOneMock.mock.calls[1]?.[1];

    expect(firstUpdate.$set.pageAccessTokenEncrypted).toBe(
      "reencrypted:decrypted:encrypted-token-a",
    );

    expect(secondUpdate.$set.pageAccessTokenEncrypted).toBe(
      "reencrypted:decrypted:encrypted-token-b",
    );
  });

  it("propagates persistence failures", async () => {
    const databaseError = new Error("MongoDB write failed");

    updateOneMock.mockRejectedValueOnce(databaseError);

    await expect(connectFacebookPages(createInput())).rejects.toBe(
      databaseError,
    );
  });

  it("propagates transaction failures", async () => {
    const transactionError = new Error("MongoDB transaction failed");

    transactionMock.mockRejectedValueOnce(transactionError);

    await expect(connectFacebookPages(createInput())).rejects.toBe(
      transactionError,
    );
  });

  it("returns a typed error for invalid OAuth sessions", async () => {
    leanMock.mockResolvedValueOnce(null);

    await expect(connectFacebookPages(createInput())).rejects.toBeInstanceOf(
      FacebookPageConnectionError,
    );
  });

  it("persists Facebook Pages sequentially", async () => {
    let releaseFirstWrite!: () => void;

    const firstWritePending = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });

    let notifyFirstWriteStarted!: () => void;

    const firstWriteStarted = new Promise<void>((resolve) => {
      notifyFirstWriteStarted = resolve;
    });

    updateOneMock.mockImplementationOnce(async () => {
      notifyFirstWriteStarted();

      await firstWritePending;

      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
      };
    });

    const connectionPromise = connectFacebookPages(
      createInput([PAGE_A, PAGE_B]),
    );

    try {
      // Wait until the first database write actually starts.
      await firstWriteStarted;

      // Page B must not start while Page A is pending.
      expect(updateOneMock).toHaveBeenCalledTimes(1);

      expect(updateOneMock.mock.calls[0]?.[0].facebookPageId).toBe(PAGE_A);
    } finally {
      // Always release the pending write, even if an assertion fails.
      releaseFirstWrite();
    }

    const result = await connectionPromise;

    expect(updateOneMock).toHaveBeenCalledTimes(2);

    expect(updateOneMock.mock.calls[1]?.[0].facebookPageId).toBe(PAGE_B);

    expect(result.connections).toHaveLength(2);
  });

  it("does not return success before the transaction resolves", async () => {
    let releaseTransaction!: () => void;

    const transactionPending = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });

    let notifyCallbackFinished!: () => void;

    const callbackFinished = new Promise<void>((resolve) => {
      notifyCallbackFinished = resolve;
    });

    transactionMock.mockImplementationOnce(
      async (callback: (session: ClientSession) => Promise<unknown>) => {
        const result = await callback(mongoSession);

        notifyCallbackFinished();

        // Simulate the transaction still waiting for commit.
        await transactionPending;

        return result;
      },
    );

    let serviceResolved = false;

    const connectionPromise = connectFacebookPages(createInput()).then(
      (result) => {
        serviceResolved = true;
        return result;
      },
    );

    try {
      // Wait until all operations inside the transaction finish.
      await callbackFinished;

      // The transaction has not resolved yet.
      expect(serviceResolved).toBe(false);

      expect(updateOneMock).toHaveBeenCalledOnce();
    } finally {
      releaseTransaction();
    }

    const result = await connectionPromise;

    expect(serviceResolved).toBe(true);

    expect(result.connections).toEqual([
      {
        facebookPageId: PAGE_A,
        pageName: "Storm Official",
        status: "connected",
      },
    ]);
  });

  it("does not report success when the second Page write fails", async () => {
    const databaseError = new Error("Second Facebook Page write failed");

    updateOneMock
      .mockResolvedValueOnce({
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
      })
      .mockRejectedValueOnce(databaseError);

    await expect(
      connectFacebookPages(createInput([PAGE_A, PAGE_B])),
    ).rejects.toBe(databaseError);

    expect(updateOneMock).toHaveBeenCalledTimes(2);

    expect(updateOneMock.mock.calls[0]?.[0].facebookPageId).toBe(PAGE_A);

    expect(updateOneMock.mock.calls[1]?.[0].facebookPageId).toBe(PAGE_B);
  });
});
