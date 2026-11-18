import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PostDetailsModal } from "./PostDetailsModal";
import { changePostSchedule } from "@/lib/posts";
import type { Post } from "@/lib/posts";
vi.mock("@/lib/posts", () => ({ changePostSchedule: vi.fn(), reconcilePublication: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const post = { _id: "507f1f77bcf86cd799439011", workspaceId: "workspace", createdByUserId: "owner", title: "Schedule", caption: "Caption", platforms: ["facebook"], mediaIds: [], status: "scheduled", scheduledAt: "2027-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" } as Post;
it("cancels a schedule and updates the displayed post", async () => {
 vi.mocked(changePostSchedule).mockResolvedValue({ ...post, status: "draft", scheduledAt: undefined });
 render(<PostDetailsModal post={post} onClose={vi.fn()} />);
 fireEvent.click(screen.getByRole("button", { name: "Cancel schedule" }));
 await screen.findByText("Draft");
 expect(changePostSchedule).toHaveBeenCalledWith(post._id, undefined);
 expect(screen.queryByRole("button", { name: "Cancel schedule" })).not.toBeInTheDocument();
});
it("keeps the schedule visible when the worker already claimed it", async () => {
 vi.mocked(changePostSchedule).mockRejectedValue(new Error("This schedule has already been claimed"));
 render(<PostDetailsModal post={post} onClose={vi.fn()} />);
 fireEvent.click(screen.getByRole("button", { name: "Cancel schedule" }));
 expect(await screen.findByRole("alert")).toHaveTextContent("already been claimed");
});

it.each(["facebook", "linkedin"] as const)("shows %s publishing errors", (platform) => {
 render(<PostDetailsModal post={{ ...post, status: "failed", platformResults: [{ platform, status: "failed", lastError: "Credentials unavailable" }] }} onClose={vi.fn()} />);
 expect(screen.getByRole("alert")).toHaveTextContent("Credentials unavailable");
});
