import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const { createMock, findOneAndDeleteMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  findOneAndDeleteMock: vi.fn(),
}));

vi.mock("../../models/LinkedInOAuthState.js", () => ({
  default: {
    create: createMock,
    findOneAndDelete: findOneAndDeleteMock,
  },
}));

import {
  consumeLinkedInOAuthState,
  createLinkedInOAuthState,
  LinkedInOAuthStateError,
} from "./linkedinOAuthStateService.js";

describe("LinkedIn OAuth state service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({});
    findOneAndDeleteMock.mockResolvedValue({ _id: "state-record" });
  });

  it("creates a random state and stores only its hash", async () => {
    const state = await createLinkedInOAuthState({
      supabaseUserId: "user-123",
      workspaceId: "507f1f77bcf86cd799439011",
    });

    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createMock).toHaveBeenCalledOnce();

    const storedRecord = createMock.mock.calls[0][0];

    expect(storedRecord.stateHash).not.toBe(state);
    expect(storedRecord.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedRecord.supabaseUserId).toBe("user-123");
    expect(storedRecord.workspaceId).toEqual(
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
    );

    expect(storedRecord.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(storedRecord.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 10 * 60 * 1000,
    );
  });

  it("rejects an empty user ID", async () => {
    await expect(
      createLinkedInOAuthState({
        supabaseUserId: " ",
        workspaceId: "507f1f77bcf86cd799439011",
      }),
    ).rejects.toMatchObject({
      name: "LinkedInOAuthStateError",
      statusCode: 401,
    });

    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed workspace ID", async () => {
    await expect(
      createLinkedInOAuthState({
        supabaseUserId: "user-123",
        workspaceId: "invalid",
      }),
    ).rejects.toBeInstanceOf(LinkedInOAuthStateError);

    expect(createMock).not.toHaveBeenCalled();
  });

  it("consumes a valid state for its user and workspace", async () => {
    const workspaceId = "507f1f77bcf86cd799439011";

    const state = await createLinkedInOAuthState({
      supabaseUserId: "user-123",
      workspaceId,
    });

    findOneAndDeleteMock.mockResolvedValueOnce({
      supabaseUserId: "user-123",
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
    });

    const result = await consumeLinkedInOAuthState({
      state,
    });

    expect(result).toEqual({
      supabaseUserId: "user-123",
      workspaceId,
    });

    expect(findOneAndDeleteMock).toHaveBeenCalledWith({
      stateHash: expect.any(String),
      expiresAt: { $gt: expect.any(Date) },
    });
  });

  it("rejects a state that is invalid or missing", async () => {
    await expect(
      consumeLinkedInOAuthState({
        state: "invalid-state",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(findOneAndDeleteMock).not.toHaveBeenCalled();
  });

  it("rejects a state that is expired, consumed, or belongs to another user", async () => {
    findOneAndDeleteMock.mockResolvedValueOnce(null);

    await expect(
      consumeLinkedInOAuthState({
        state: "A".repeat(43),
      }),
    ).rejects.toMatchObject({
      name: "LinkedInOAuthStateError",
      statusCode: 400,
    });
  });

  it("rejects a state when the workspace does not match", async () => {
    findOneAndDeleteMock.mockResolvedValueOnce(null);

    await expect(
      consumeLinkedInOAuthState({
        state: "A".repeat(43),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
