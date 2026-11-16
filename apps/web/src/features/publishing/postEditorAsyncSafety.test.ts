import { describe, expect, it } from "vitest";

import {
  createPostEditorSession,
  validatePostEditorSession,
} from "./postEditorSession";

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";
const POST_A = "507f1f77bcf86cd799439013";

function canContinuePublishing(
  original: ReturnType<typeof createPostEditorSession>,
  current: ReturnType<typeof createPostEditorSession>,
  originalRevision: number,
  currentRevision: number,
) {
  return (
    validatePostEditorSession(original, current).valid &&
    originalRevision === currentRevision
  );
}

describe("Post Editor asynchronous publishing safety", () => {
  it("allows publishing when the editor session is unchanged", () => {
    const session = createPostEditorSession("create", WORKSPACE_A, null);

    expect(canContinuePublishing(session, session, 0, 0)).toBe(true);
  });

  it("blocks publishing after switching workspaces", () => {
    const original = createPostEditorSession("create", WORKSPACE_A, null);

    const current = createPostEditorSession("create", WORKSPACE_B, null);

    expect(canContinuePublishing(original, current, 0, 1)).toBe(false);
  });

  it("blocks publishing after switching posts", () => {
    const original = createPostEditorSession("edit", WORKSPACE_A, POST_A);

    const current = createPostEditorSession(
      "edit",
      WORKSPACE_A,
      "507f1f77bcf86cd799439014",
    );

    expect(canContinuePublishing(original, current, 0, 1)).toBe(false);
  });

  it("detects switching away and back to the original workspace", () => {
    const original = createPostEditorSession("create", WORKSPACE_A, null);

    const current = createPostEditorSession("create", WORKSPACE_A, null);

    expect(canContinuePublishing(original, current, 0, 2)).toBe(false);
  });
});
