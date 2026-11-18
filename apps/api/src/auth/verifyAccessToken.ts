import { createHash } from "node:crypto";
import { supabaseAuthClient } from "./supabase.js";

const pending = new Map<string, ReturnType<typeof supabaseAuthClient.auth.getUser>>();

/** Coalesce concurrent checks only. Each later request still checks current
 * account state with Auth, preserving the existing live-user policy. */
export function verifyAccessToken(token: string) {
  const key = createHash("sha256").update(token).digest("hex");
  const existing = pending.get(key);
  if (existing) return existing;
  const verification = supabaseAuthClient.auth.getUser(token);
  if (pending.size >= 256) return verification;
  pending.set(key, verification);
  const cleanup = () => { if (pending.get(key) === verification) pending.delete(key); };
  void verification.then(cleanup, cleanup);
  return verification;
}
