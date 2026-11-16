import { describe, expect, it } from "vitest";

import {
  createPostEditorSession,
  validatePostEditorSession,
  getPostEditorSessionError,
} from "./postEditorSession";

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";

const POST_A = "507f1f77bcf86cd799439013";
const POST_B = "507f1f77bcf86cd799439014";

describe("Post Editor asynchronous session guard", () => {
  it("accepts an unchanged create session", () => {
    const original = createPostEditorSession("create", WORKSPACE_A, null);

    const current = createPostEditorSession("create", WORKSPACE_A, null);

    expect(validatePostEditorSession(original, current)).toEqual({
      valid: true,
      reason: "valid",
    });
  });

  it("accepts an unchanged edit session", () => {
    const original = createPostEditorSession("edit", WORKSPACE_A, POST_A);

    const current = createPostEditorSession("edit", WORKSPACE_A, POST_A);

    expect(validatePostEditorSession(original, current).valid).toBe(true);
  });

  it("rejects a workspace switch during draft creation", () => {
    const original = createPostEditorSession("create", WORKSPACE_A, null);

    const current = createPostEditorSession("create", WORKSPACE_B, null);

    expect(validatePostEditorSession(original, current)).toEqual({
      valid: false,
      reason: "workspace-changed",
    });
  });

  it("rejects a workspace switch during draft editing", () => {
    const original = createPostEditorSession("edit", WORKSPACE_A, POST_A);

    const current = createPostEditorSession("edit", WORKSPACE_B, POST_A);

    expect(validatePostEditorSession(original, current).valid).toBe(false);
  });

  it("rejects switching to another post", () => {
    const original = createPostEditorSession("edit", WORKSPACE_A, POST_A);

    const current = createPostEditorSession("edit", WORKSPACE_A, POST_B);

    expect(validatePostEditorSession(original, current)).toEqual({
      valid: false,
      reason: "post-changed",
    });
  });

  it("rejects a change in editor mode", () => {
    const original = createPostEditorSession("edit", WORKSPACE_A, POST_A);

    const current = createPostEditorSession("create", WORKSPACE_A, POST_A);

    expect(validatePostEditorSession(original, current)).toEqual({
      valid: false,
      reason: "mode-changed",
    });
  });

  it("provides a helpful workspace-switch message", () => {
    const result = validatePostEditorSession(
      createPostEditorSession("create", WORKSPACE_A, null),
      createPostEditorSession("create", WORKSPACE_B, null),
    );

    expect(getPostEditorSessionError(result)).toMatch(/workspace changed/i);

    expect(getPostEditorSessionError(result)).toMatch(/posts page/i);
  });

  it("returns no error for a valid session", () => {
    expect(
      getPostEditorSessionError({
        valid: true,
        reason: "valid",
      }),
    ).toBeNull();
  });

  it("does not mutate the original session", () => {
    const original = createPostEditorSession("edit", WORKSPACE_A, POST_A);

    validatePostEditorSession(
      original,
      createPostEditorSession("edit", WORKSPACE_B, POST_B),
    );

    expect(original).toEqual({
      mode: "edit",
      workspaceId: WORKSPACE_A,
      postId: POST_A,
    });
  });
});
