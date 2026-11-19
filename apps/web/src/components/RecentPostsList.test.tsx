import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { RecentPostsList, type RecentPostItem } from "./RecentPostsList";
import { getMediaLibraryItem } from "@/lib/mediaLibrary";
import { getWorkspaceImageUrl } from "@/lib/imageGeneration";

vi.mock("@/lib/mediaLibrary", () => ({ getMediaLibraryItem: vi.fn() }));
vi.mock("@/lib/imageGeneration", () => ({ getWorkspaceImageUrl: vi.fn() }));
const post: RecentPostItem = {
  id: "post-1", title: "Launch", platform: "facebook, linkedin", status: "Draft",
  date: "Full date", timestamp: "2026-11-16T06:17:00Z", color: "", initials: "DR",
  mediaId: "asset-1", workspaceId: "workspace-1",
};
function setup() {
  const onDelete = vi.fn();
  render(<RecentPostsList posts={[post]} loading={false} loadError="" search=""
    deleteError="" deletingPostId={null} hasMorePosts={false} loadingMorePosts={false}
    onView={vi.fn()} onEdit={vi.fn()} onDelete={onDelete} onMoreOptions={vi.fn()} onLoadMore={vi.fn()} />);
  return { onDelete };
}
describe("post rows", () => {
  it("loads actual media, labels every platform, and exposes the full timestamp", async () => {
    vi.mocked(getMediaLibraryItem).mockResolvedValue({ assetId: "asset-1", sourceWorkspaceId: "source-workspace" } as Awaited<ReturnType<typeof getMediaLibraryItem>>);
    vi.mocked(getWorkspaceImageUrl).mockResolvedValue({ url: "https://example.test/photo.jpg" } as Awaited<ReturnType<typeof getWorkspaceImageUrl>>);
    const { container } = render(<RecentPostsList posts={[post]} loading={false} loadError="" search="" deleteError="" deletingPostId={null} hasMorePosts={false} loadingMorePosts={false} onEdit={vi.fn()} onDelete={vi.fn()} onMoreOptions={vi.fn()} onLoadMore={vi.fn()} />);
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.test/photo.jpg"));
    expect(getWorkspaceImageUrl).toHaveBeenCalledWith("source-workspace", "asset-1");
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
    expect(screen.getByText("Facebook")).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute("datetime", new Date(post.timestamp!).toISOString());
    expect(container.querySelector("time")?.title).toBeTruthy();
  });
  it("keeps deletion in the menu and supports Escape and keyboard focus", async () => {
    vi.mocked(getMediaLibraryItem).mockRejectedValue(new Error("Unavailable"));
    vi.mocked(getWorkspaceImageUrl).mockRejectedValue(new Error("Unavailable"));
    const user = userEvent.setup();
    const { onDelete } = setup();
    expect(screen.queryByRole("button", { name: "Delete draft" })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "More options for Launch" });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Delete draft" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Delete draft" }));
    expect(onDelete).toHaveBeenCalledWith("post-1", "Launch");
  });
});
