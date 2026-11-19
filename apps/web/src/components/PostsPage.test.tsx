import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, it, expect } from "vitest";
import { PostsPage } from "./PostsPage";

it("shows status totals and forwards status, platform, sort, search, and creation actions", async () => {
  const user = userEvent.setup();
  const onStatusFilterChange = vi.fn();
  const onSortChange = vi.fn();
  const onPlatformFilterChange = vi.fn();
  const onSearchChange = vi.fn();
  const onCreatePost = vi.fn();
  render(<PostsPage search="" statusFilter="all" platformFilter="all" sort="newest"
    statusCounts={{ all: 50, published: 30, scheduled: 10, draft: 8, failed: 2 }}
    onStatusFilterChange={onStatusFilterChange} onSortChange={onSortChange}
    onPlatformFilterChange={onPlatformFilterChange} onSearchChange={onSearchChange}
    onCreatePost={onCreatePost}>Results</PostsPage>);
  expect(screen.getByRole("button", { name: "All 50" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Published 30" }));
  expect(onStatusFilterChange).toHaveBeenCalledWith("published");
  await user.selectOptions(screen.getByLabelText("Sort"), "oldest");
  expect(onSortChange).toHaveBeenCalledWith("oldest");
  await user.selectOptions(screen.getByLabelText("Platform"), "linkedin");
  expect(onPlatformFilterChange).toHaveBeenCalledWith("linkedin");
  await user.type(screen.getByLabelText("Search posts"), "x");
  expect(onSearchChange).toHaveBeenCalledWith("x");
  await user.click(screen.getByRole("button", { name: "Create post" }));
  expect(onCreatePost).toHaveBeenCalledOnce();
});
