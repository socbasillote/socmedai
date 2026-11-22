import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DraftDeleteConfirmation } from "./DraftDeleteConfirmation";
import type { useDashboardPosts } from "../hooks/useDashboardPosts";

afterEach(cleanup);
function setup(handleDeleteDraft = vi.fn().mockResolvedValue(true)) {
  const posts = { handleDeleteDraft, deletingPostId: null, deletePostError: "" } as unknown as ReturnType<typeof useDashboardPosts>;
  render(<DraftDeleteConfirmation posts={posts}>{(request) => <button onClick={() => request("draft-id", "Coffee story")}>Remove</button>}</DraftDeleteConfirmation>);
  fireEvent.click(screen.getByText("Remove"));
  return handleDeleteDraft;
}
it("requires confirmation and lets the user cancel", async () => {
  const remove = setup();
  expect(await screen.findByRole("dialog")).toHaveTextContent("Coffee story");
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Cancel"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(remove).not.toHaveBeenCalled();
});
it("deletes the selected draft and closes after success", async () => {
  const remove = setup();
  fireEvent.click(await screen.findByRole("button", { name: "Delete draft" }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith("draft-id"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("keeps the dialog open after failure so deletion can be retried", async () => {
  const remove = setup(vi.fn().mockResolvedValue(false));
  fireEvent.click(await screen.findByRole("button", { name: "Delete draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Please try again");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  remove.mockResolvedValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
