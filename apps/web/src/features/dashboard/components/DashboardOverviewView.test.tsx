import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DashboardOverviewView } from "./DashboardOverviewView";
import { DashboardPostsView } from "@/features/posts/components/DashboardPostsView";
import type { useDashboardPosts } from "@/features/posts/hooks/useDashboardPosts";

vi.mock("@/components/DashboardOverview", () => ({
  DashboardOverview: ({ onEdit }: { onEdit: (id: string) => void }) =>
    <button onClick={() => onEdit("post-1")}>Edit draft</button>,
}));
vi.mock("@/components/PostsPage", () => ({
  PostsPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/RecentPostsList", () => ({
  RecentPostsList: ({ onEdit }: { onEdit: (id: string) => void }) =>
    <button onClick={() => onEdit("post-1")}>Edit draft</button>,
}));

describe.each([
  ["dashboard overview", DashboardOverviewView],
  ["posts page", DashboardPostsView],
] as const)("draft editing from %s", (_, View) => {
  it.each(["draft", "published"])("only routes editable drafts (%s)", async (status) => {
    const onEditDraft = vi.fn();
    const posts = {
      savedPosts: [{ _id: "post-1", status }],
    } as ReturnType<typeof useDashboardPosts>;
    render(<View posts={posts} onEditDraft={onEditDraft} onCreatePost={vi.fn()}
      onOpenStudio={vi.fn()} onViewPublishing={vi.fn()} onMoreOptions={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Edit draft" }));
    if (status === "draft") {
      expect(onEditDraft).toHaveBeenCalledWith("post-1");
    } else {
      expect(onEditDraft).not.toHaveBeenCalled();
    }
  });
});
