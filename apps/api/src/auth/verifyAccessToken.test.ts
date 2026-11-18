import { afterEach, expect, it, vi } from "vitest";
import { supabaseAuthClient } from "./supabase.js";
import { verifyAccessToken } from "./verifyAccessToken.js";
afterEach(() => vi.restoreAllMocks());
it("shares concurrent verification but performs a fresh check after completion", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>) => void;
  const spy = vi.spyOn(supabaseAuthClient.auth, "getUser").mockImplementation(() => new Promise((done) => { resolve = done; }));
  const first = verifyAccessToken("same-token");
  const second = verifyAccessToken("same-token");
  expect(first).toBe(second); expect(spy).toHaveBeenCalledTimes(1);
  resolve({ data: { user: { id: "user", aud: "authenticated", created_at: "", app_metadata: {}, user_metadata: {} } }, error: null } as Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>);
  await first;
  const fresh = verifyAccessToken("same-token");
  expect(spy).toHaveBeenCalledTimes(2);
  resolve({ data: { user: { id: "user", aud: "authenticated", created_at: "", app_metadata: {}, user_metadata: {} } }, error: null } as Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>); await fresh;
});
it("isolates tokens and clears failures", async () => {
  const spy = vi.spyOn(supabaseAuthClient.auth, "getUser").mockRejectedValue(new Error("offline"));
  await Promise.allSettled([verifyAccessToken("a"), verifyAccessToken("b")]);
  expect(spy).toHaveBeenCalledTimes(2);
  await expect(verifyAccessToken("a")).rejects.toThrow("offline");
  expect(spy).toHaveBeenCalledTimes(3);
});
