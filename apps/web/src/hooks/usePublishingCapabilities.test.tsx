import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePublishingCapabilities } from "./usePublishingCapabilities";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: mocks.fetch }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("fails closed while loading and refreshes capabilities on focus", async () => {
  let resolve!: (value: unknown) => void;
  mocks.fetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { result } = renderHook(() => usePublishingCapabilities());
  expect(result.current).toEqual({});
  await act(async () => resolve({ capabilities: { facebook: { publishNow: true, schedule: false } } }));
  expect(result.current.facebook.schedule).toBe(false);
  expect(mocks.fetch).toHaveBeenCalledWith("/api/posts/capabilities", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  mocks.fetch.mockRejectedValueOnce(new Error("Unavailable"));
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(result.current).toEqual({}));
});

it("aborts the request when the editor unmounts", () => {
  mocks.fetch.mockReturnValue(new Promise(() => {}));
  const { unmount } = renderHook(() => usePublishingCapabilities());
  const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
  unmount();
  expect(signal.aborted).toBe(true);
});


it("ignores an older response after a focus refresh", async () => {
  let resolveOld!: (value: unknown) => void;
  mocks.fetch.mockReturnValueOnce(new Promise((done) => { resolveOld = done; }));
  const { result } = renderHook(() => usePublishingCapabilities());
  mocks.fetch.mockResolvedValueOnce({ capabilities: { facebook: { publishNow: false, schedule: false } } });
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(result.current.facebook?.publishNow).toBe(false));
  await act(async () => resolveOld({ capabilities: { facebook: { publishNow: true, schedule: true } } }));
  expect(result.current.facebook.publishNow).toBe(false);
});
