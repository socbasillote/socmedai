import { describe, expect, it } from "vitest";

import { validatePostWorkspaceContext } from "./postWorkspaceContext";

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";

describe("Post workspace context", () => {
  it("allows creating a post in the active workspace", () => {
    expect(
      validatePostWorkspaceContext({
        mode: "create",
        activeWorkspaceId: WORKSPACE_A,
        postWorkspaceId: null,
      }),
    ).toEqual({
      valid: true,
      message: null,
    });
  });

  it("rejects creation without an active workspace", () => {
    const result = validatePostWorkspaceContext({
      mode: "create",
      activeWorkspaceId: null,
      postWorkspaceId: null,
    });

    expect(result.valid).toBe(false);
  });

  it("allows editing a draft in its own workspace", () => {
    const result = validatePostWorkspaceContext({
      mode: "edit",
      activeWorkspaceId: WORKSPACE_B,
      postWorkspaceId: WORKSPACE_B,
    });

    expect(result.valid).toBe(true);
  });

  it("rejects editing under another workspace", () => {
    const result = validatePostWorkspaceContext({
      mode: "edit",
      activeWorkspaceId: WORKSPACE_A,
      postWorkspaceId: WORKSPACE_B,
    });

    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/another workspace/i);
  });

  it("rejects editing before the draft workspace is known", () => {
    const result = validatePostWorkspaceContext({
      mode: "edit",
      activeWorkspaceId: WORKSPACE_A,
      postWorkspaceId: null,
    });

    expect(result.valid).toBe(false);
  });

  it("allows editing again after switching to the correct workspace", () => {
    const incorrect = validatePostWorkspaceContext({
      mode: "edit",
      activeWorkspaceId: WORKSPACE_A,
      postWorkspaceId: WORKSPACE_B,
    });

    const corrected = validatePostWorkspaceContext({
      mode: "edit",
      activeWorkspaceId: WORKSPACE_B,
      postWorkspaceId: WORKSPACE_B,
    });

    expect(incorrect.valid).toBe(false);
    expect(corrected.valid).toBe(true);
  });
});
