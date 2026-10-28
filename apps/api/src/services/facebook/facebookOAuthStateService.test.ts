import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const { createMock, findOneAndDeleteMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  findOneAndDeleteMock: vi.fn(),
}));

vi.mock("../../models/FacebookOAuthState.js", () => ({
  default: {
    create: createMock,
    findOneAndDelete: findOneAndDeleteMock,
  },
}));

import {
  consumeFacebookOAuthState,
  createFacebookOAuthState,
  FacebookOAuthStateError,
} from "./facebookOAuthStateService.js";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

describe("Facebook OAuth state service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createMock.mockResolvedValue({});
    findOneAndDeleteMock.mockResolvedValue(null);
  });

  it("creates a random state and stores only its SHA-256 hash", async () => {
    const state = await createFacebookOAuthState({
      supabaseUserId: "user-123",
      workspaceId: WORKSPACE_ID,
    });

    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createMock).toHaveBeenCalledOnce();

    const storedRecord = createMock.mock.calls[0][0];

    const expectedHash = createHash("sha256").update(state).digest("hex");

    expect(storedRecord.stateHash).toBe(expectedHash);
    expect(storedRecord.stateHash).not.toBe(state);

    expect(storedRecord.supabaseUserId).toBe("user-123");

    expect(storedRecord.workspaceId).toEqual(
      new mongoose.Types.ObjectId(WORKSPACE_ID),
    );

    expect(storedRecord.expiresAt).toBeInstanceOf(Date);

    expect(storedRecord.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(storedRecord.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 10 * 60 * 1000,
    );
  });

  it("generates a different state for each authorization request", async () => {
    const firstState = await createFacebookOAuthState({
      supabaseUserId: "user-123",
      workspaceId: WORKSPACE_ID,
    });

    const secondState = await createFacebookOAuthState({
      supabaseUserId: "user-123",
      workspaceId: WORKSPACE_ID,
    });

    expect(firstState).not.toBe(secondState);

    expect(createMock).toHaveBeenCalledTimes(2);

    const firstHash = createMock.mock.calls[0][0].stateHash;
    const secondHash = createMock.mock.calls[1][0].stateHash;

    expect(firstHash).not.toBe(secondHash);
  });

  it("rejects an empty authenticated user ID", async () => {
    await expect(
      createFacebookOAuthState({
        supabaseUserId: " ",
        workspaceId: WORKSPACE_ID,
      }),
    ).rejects.toMatchObject({
      name: "FacebookOAuthStateError",
      statusCode: 401,
    });

    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid workspace ID", async () => {
    await expect(
      createFacebookOAuthState({
        supabaseUserId: "user-123",
        workspaceId: "invalid-workspace",
      }),
    ).rejects.toMatchObject({
      name: "FacebookOAuthStateError",
      statusCode: 404,
    });

    expect(createMock).not.toHaveBeenCalled();
  });

  it("consumes a valid state and returns its user and workspace", async () => {
    const state = await createFacebookOAuthState({
      supabaseUserId: "user-123",
      workspaceId: WORKSPACE_ID,
    });

    findOneAndDeleteMock.mockResolvedValueOnce({
      supabaseUserId: "user-123",
      workspaceId: new mongoose.Types.ObjectId(WORKSPACE_ID),
    });

    const result = await consumeFacebookOAuthState({
      state,
    });

    expect(result).toEqual({
      supabaseUserId: "user-123",
      workspaceId: WORKSPACE_ID,
    });

    const expectedHash = createHash("sha256").update(state).digest("hex");

    expect(findOneAndDeleteMock).toHaveBeenCalledWith({
      stateHash: expectedHash,
      expiresAt: {
        $gt: expect.any(Date),
      },
    });
  });

  it("rejects malformed authorization states", async () => {
    const invalidStates = [
      "",
      "invalid-state",
      "A".repeat(42),
      "A".repeat(44),
      "A".repeat(42) + "!",
    ];

    for (const state of invalidStates) {
      await expect(consumeFacebookOAuthState({ state })).rejects.toBeInstanceOf(
        FacebookOAuthStateError,
      );
    }

    expect(findOneAndDeleteMock).not.toHaveBeenCalled();
  });

  it("rejects expired or nonexistent states", async () => {
    findOneAndDeleteMock.mockResolvedValueOnce(null);

    await expect(
      consumeFacebookOAuthState({
        state: "A".repeat(43),
      }),
    ).rejects.toMatchObject({
      name: "FacebookOAuthStateError",
      statusCode: 400,
    });

    expect(findOneAndDeleteMock).toHaveBeenCalledOnce();

    expect(findOneAndDeleteMock).toHaveBeenCalledWith({
      stateHash: expect.any(String),
      expiresAt: {
        $gt: expect.any(Date),
      },
    });
  });

  it("rejects reuse of an already consumed state", async () => {
    const state = await createFacebookOAuthState({
      supabaseUserId: "user-123",
      workspaceId: WORKSPACE_ID,
    });

    findOneAndDeleteMock
      .mockResolvedValueOnce({
        supabaseUserId: "user-123",
        workspaceId: new mongoose.Types.ObjectId(WORKSPACE_ID),
      })
      .mockResolvedValueOnce(null);

    const firstResult = await consumeFacebookOAuthState({
      state,
    });

    expect(firstResult.workspaceId).toBe(WORKSPACE_ID);

    await expect(
      consumeFacebookOAuthState({
        state,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(findOneAndDeleteMock).toHaveBeenCalledTimes(2);
  });

  it("allows only one successful concurrent state consumption", async () => {
    const state = await createFacebookOAuthState({
      supabaseUserId: "user-123",
      workspaceId: WORKSPACE_ID,
    });

    findOneAndDeleteMock
      .mockResolvedValueOnce({
        supabaseUserId: "user-123",
        workspaceId: new mongoose.Types.ObjectId(WORKSPACE_ID),
      })
      .mockResolvedValueOnce(null);

    const results = await Promise.allSettled([
      consumeFacebookOAuthState({ state }),
      consumeFacebookOAuthState({ state }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");

    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    expect(findOneAndDeleteMock).toHaveBeenCalledTimes(2);
  });
});
