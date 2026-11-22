import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { useComposerAutosave } from "./useComposerAutosave";
import { syncComposerDrafts } from "../lib/composerDraftRecovery";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
const content = { workspaceId: "507f1f77bcf86cd799439011", title: "", caption: "", platforms: ["linkedin"] as ["linkedin"], mediaIds: [] as string[] };
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.mocked(apiFetch).mockReset().mockResolvedValue({ post: { _id: "saved" } }); });
afterEach(async () => { cleanup(); await vi.advanceTimersByTimeAsync(0); vi.useRealTimers(); });
it.each([
  { title: "", caption: "" },
  { title: "  ", caption: "\n\t " },
])("does not save an empty form with defaults: %j", async (fields) => {
  const hook = renderHook(() => useComposerAutosave({ ownerId: "owner", enabled: true, content: { ...content, ...fields, scheduledAt: "2027-01-06T06:15:00.000Z" } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); window.dispatchEvent(new Event("pagehide")); });
  hook.unmount();
  await syncComposerDrafts("owner");
  expect(apiFetch).not.toHaveBeenCalled();
  expect(Object.keys(localStorage)).toHaveLength(0);
});
it.each([{ title: "A title" }, { caption: "A caption" }, { mediaIds: ["image-id"] }])("starts saving when content is added: %j", async (fields) => {
  const hook = renderHook(({ value }) => useComposerAutosave({ ownerId: "owner", enabled: true, content: value }), { initialProps: { value: content } });
  hook.rerender({ value: { ...content, ...fields } });
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  expect(apiFetch).toHaveBeenCalledOnce();
  hook.rerender({ value: content });
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  expect(JSON.parse(vi.mocked(apiFetch).mock.calls.at(-1)![1]!.body as string).caption).toBe("");
  expect(apiFetch).toHaveBeenCalledTimes(2);
});
it("saves Untitled drafts with content before browser closure and reuses the same identity for edits", async () => {
  const hook = renderHook(({ caption }) => useComposerAutosave({ ownerId: "owner", enabled: true, content: { ...content, caption } }), { initialProps: { caption: "Initial caption" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  const first = JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
  expect(first.title).toBe("Untitled");
  expect(first.caption).toBe("Initial caption");
  hook.rerender({ caption: "Latest caption" });
  await act(async () => { window.dispatchEvent(new Event("pagehide")); await vi.advanceTimersByTimeAsync(0); });
  const last = JSON.parse(vi.mocked(apiFetch).mock.calls.at(-1)![1]!.body as string);
  expect(last.caption).toBe("Latest caption");
  expect(last.clientDraftId).toBe(first.clientDraftId);
  expect(last.revision).toBeGreaterThan(first.revision);
  expect(vi.mocked(apiFetch).mock.calls.at(-1)![1]!.keepalive).toBe(true);
});
it("retains offline drafts across remounts and retries only for the owning account", async () => {
  vi.mocked(apiFetch).mockRejectedValue(new Error("Offline"));
  const hook = renderHook(() => useComposerAutosave({ ownerId: "owner-a", enabled: true, content: { ...content, caption: "Keep me" } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  hook.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(Object.keys(localStorage).length).toBe(1);
  vi.mocked(apiFetch).mockClear().mockResolvedValue({ post: { _id: "saved" } });
  await syncComposerDrafts("owner-b");
  expect(apiFetch).not.toHaveBeenCalled();
  await syncComposerDrafts("owner-a");
  expect(apiFetch).toHaveBeenCalledOnce();
  expect(Object.keys(localStorage)).toHaveLength(0);
});
it("does not overwrite a successful explicit save when the editor unmounts", async () => {
  const hook = renderHook(() => useComposerAutosave({ ownerId: "owner", enabled: true, content }));
  act(() => hook.result.current.complete());
  hook.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(apiFetch).not.toHaveBeenCalled();
  expect(Object.keys(localStorage)).toHaveLength(0);
});
