// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AIReviewResume } from "./AIReviewResume";
vi.mock("@/auth/useAuth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("../lib/aiReviewBatch", () => ({ readAIReviewBatch: (owner: string, workspace: string) => owner === "owner" && workspace === "workspace" ? { posts: [{ id: "post" }] } : null }));
afterEach(cleanup);
it("offers a route back to the current workspace's review", () => {
  const resume = vi.fn();
  render(<AIReviewResume workspaceId="workspace" onResume={resume} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue reviewing" }));
  expect(resume).toHaveBeenCalledOnce();
});
it("does not show a different workspace's review", () => {
  render(<AIReviewResume workspaceId="other-workspace" onResume={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Continue reviewing" })).toBeNull();
});
