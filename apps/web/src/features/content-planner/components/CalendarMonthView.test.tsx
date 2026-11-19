import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Post } from "@/lib/posts";
import { CalendarMonthView } from "./CalendarMonthView";

function post(id: string, day: number, status: Post["status"] = "published"): Post {
  const timestamp = new Date(2026, 10, day, 8, 10).toISOString();
  return { _id: id, workspaceId: "workspace", createdByUserId: "user", title: id,
    caption: id, platforms: ["linkedin"], mediaIds: [], status,
    scheduledAt: timestamp, publishedAt: status === "published" ? timestamp : undefined,
    createdAt: timestamp, updatedAt: timestamp };
}
const base = { year: 2026, monthIndex: 10, loading: false, error: "",
  onPreviousMonth: vi.fn(), onNextMonth: vi.fn(), onToday: vi.fn(), onRetry: vi.fn(),
  onViewPost: vi.fn(), onCreateForDate: vi.fn() };
afterEach(() => vi.useRealTimers());

it("caps days at two chips, opens all overflow posts in a modal, and restores focus on close", async () => {
  const user = userEvent.setup();
  const posts = Array.from({ length: 4 }, (_, index) => post(`Post ${index}`, 17));
  const { container } = render(<CalendarMonthView {...base} posts={posts} />);
  const cell = container.querySelector('[data-date="2026-11-17"]') as HTMLElement;
  expect(within(cell).getAllByRole("button", { name: /View published post/ })).toHaveLength(2);
  expect(within(cell).getByText("+2 more")).toBeInTheDocument();
  await user.click(within(cell).getByText("+2 more"));
  const details = await screen.findByRole("dialog", { name: /November 17, 2026/ });
  expect(within(details).getAllByRole("button", { name: /View published post/ })).toHaveLength(4);
  expect(within(details).getByRole("heading")).toHaveFocus();
  expect(container.querySelector("#calendar-day-details")).toBeNull();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(within(cell).getByText("+2 more")).toHaveFocus();
  await user.click(within(cell).getByText("+2 more"));
  await user.click(screen.getByRole("button", { name: "Close day posts" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("shows dated drafts, platform icons, times, status shapes, and accurate totals", () => {
  const { container } = render(<CalendarMonthView {...base} posts={[
    post("Published post", 17), post("Draft 14", 14, "draft"), post("Draft 16", 16, "draft"), post("Scheduled post", 20, "scheduled"),
  ]} />);
  expect(screen.getByRole("status").textContent).toBe("1 published \u00b7 2 drafts \u00b7 1 scheduled");
  const draftCell = container.querySelector('[data-date="2026-11-14"]') as HTMLElement;
  const draft = within(draftCell).getByRole("button", { name: /View draft post: Draft 14/ });
  expect(draft).toHaveClass("border-dashed", "border-amber-500");
  expect(within(draft).getByLabelText("LinkedIn")).toBeInTheDocument();
  expect(draft.querySelector("time")?.textContent).toBeTruthy();
  expect(screen.getByRole("button", { name: /View published post: Published post/ })).toHaveClass("bg-emerald-700");
  expect(screen.getByRole("button", { name: /View scheduled post: Scheduled post/ })).toHaveClass("border-l-4");
});

it("highlights today's entire cell, tints weekends, dims adjacent months, and creates from empty days", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 18, 12));
  const user = userEvent.setup();
  const onCreateForDate = vi.fn();
  const { container } = render(<CalendarMonthView {...base} posts={[]} onCreateForDate={onCreateForDate} />);
  expect(container.querySelector('[data-date="2026-11-18"]')).toHaveAttribute("aria-current", "date");
  expect(container.querySelector('[data-date="2026-11-18"]')).toHaveClass("bg-violet-50", "ring-2");
  expect(container.querySelector('[data-date="2026-11-14"]')).toHaveClass("bg-slate-50");
  expect(container.querySelector('[data-date="2026-12-01"]')).toHaveClass("bg-slate-100");
  await user.click(screen.getByRole("button", { name: /Create post for.*Nov 20/ }));
  expect(onCreateForDate).toHaveBeenCalledWith("2026-11-20");
});

it("renders a week across month boundaries and a list with all posts", () => {
  const posts = [post("Week post", 30)];
  const { container, rerender } = render(<CalendarMonthView {...base} view="week" weekAnchor={new Date(2026, 10, 30)} posts={posts} />);
  expect(container.querySelectorAll("[data-date]")).toHaveLength(7);
  expect(container.querySelector('[data-date="2026-12-05"]')).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next week" })).toBeInTheDocument();
  rerender(<CalendarMonthView {...base} view="list" posts={Array.from({ length: 4 }, (_, index) => post(`Post ${index}`, 17))} />);
  expect(screen.getAllByRole("button", { name: /View published post/ })).toHaveLength(4);
  expect(container.querySelectorAll("[data-date]")).toHaveLength(0);
});

it("opens post details from the day modal and closes the day modal", async () => {
  const user = userEvent.setup();
  const onViewPost = vi.fn();
  const posts = Array.from({ length: 3 }, (_, index) => post(`Post ${index}`, 17));
  render(<CalendarMonthView {...base} posts={posts} onViewPost={onViewPost} />);
  await user.click(screen.getByText("+1 more"));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: /View published post: Post 2/ }));
  expect(onViewPost).toHaveBeenCalledWith(posts[2]);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
