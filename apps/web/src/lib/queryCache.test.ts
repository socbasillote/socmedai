import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cachedQuery, clearQueryCache, getQueryTtl } from "./queryCache";
beforeEach(clearQueryCache);
afterEach(() => vi.useRealTimers());
it("deduplicates in-flight requests, isolates sessions, and expires private data", async () => {
  vi.useFakeTimers();
  const loader = vi.fn(async () => "private");
  await Promise.all([cachedQuery("session-a:image", loader, 45_000), cachedQuery("session-a:image", loader, 45_000)]);
  expect(loader).toHaveBeenCalledTimes(1);
  await cachedQuery("session-b:image", loader, 45_000);
  expect(loader).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(45_001);
  await cachedQuery("session-a:image", loader, 45_000);
  expect(loader).toHaveBeenCalledTimes(3);
});
it("does not cache errors or revive an invalidated pending query", async () => {
  const failing = vi.fn().mockRejectedValue(new Error("offline"));
  await expect(cachedQuery("failed", failing, 1000)).rejects.toThrow();
  await expect(cachedQuery("failed", failing, 1000)).rejects.toThrow();
  expect(failing).toHaveBeenCalledTimes(2);
  let resolve!: (value: string) => void;
  const old = cachedQuery("key", () => new Promise<string>((done) => { resolve = done; }), 1000);
  await Promise.resolve(); clearQueryCache();
  const fresh = vi.fn(async () => "new");
  await cachedQuery("key", fresh, 1000);
  resolve("old"); await old;
  expect(await cachedQuery("key", fresh, 1000)).toBe("new");
});
it("does not cache changing generation state, credits, or posts", () => {
  expect(getQueryTtl("/api/posts/workspaces/a")).toBe(0);
  expect(getQueryTtl("/api/ai/workspaces/a/images/credits")).toBe(0);
  expect(getQueryTtl("/api/ai/workspaces/a/images/b")).toBe(0);
});
