import { beforeEach, afterEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ token: "session-a" }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: session.token } }, error: null }) } } }));
import { apiFetch } from "./api";
import { clearQueryCache } from "./queryCache";
const transport = vi.fn<typeof fetch>();
beforeEach(() => { clearQueryCache(); vi.resetAllMocks(); session.token = "session-a"; vi.stubGlobal("fetch", transport); transport.mockImplementation(async () => new Response(JSON.stringify({ value: "fresh" }), { status: 200 })); });
afterEach(() => vi.unstubAllGlobals());
it("deduplicates private reads and invalidates after a mutation", async () => {
  await Promise.all([apiFetch("/api/workspaces"), apiFetch("/api/workspaces")]);
  expect(transport).toHaveBeenCalledTimes(1);
  await apiFetch("/api/workspaces", { method: "POST", body: "{}" });
  await apiFetch("/api/workspaces");
  expect(transport).toHaveBeenCalledTimes(3);
});
it("does not share cached responses across sessions and supports explicit refresh", async () => {
  await apiFetch("/api/workspaces");
  session.token = "session-b";
  await apiFetch("/api/workspaces");
  await apiFetch("/api/workspaces", { cache: "no-store" });
  expect(transport).toHaveBeenCalledTimes(3);
});
it("passes cancellation to fetch and never caches cancelled requests", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(apiFetch("/api/workspaces", { signal: controller.signal })).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});

it("shares both metadata and signed-URL requests between editor previews", async () => {
  const metadata = "/api/ai/media/library/507f1f77bcf86cd799439012";
  const url = "/api/ai/workspaces/507f1f77bcf86cd799439011/images/507f1f77bcf86cd799439012/url";
  await Promise.all([apiFetch(metadata), apiFetch(metadata), apiFetch(url), apiFetch(url)]);
  expect(transport).toHaveBeenCalledTimes(2);
});
