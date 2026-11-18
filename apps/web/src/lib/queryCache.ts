type Entry = { expiresAt: number; promise: Promise<unknown> };
const entries = new Map<string, Entry>();

export function clearQueryCache() { entries.clear(); }

export function cachedQuery<T>(key: string, load: () => Promise<T>, ttlMs: number): Promise<T> {
  const existing = entries.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.promise as Promise<T>;
  const entry: Entry = { expiresAt: Date.now() + ttlMs, promise: Promise.resolve().then(load) };
  entries.set(key, entry);
  if (entries.size > 200) entries.delete(entries.keys().next().value!);
  void entry.promise.catch(() => {
    if (entries.get(key) === entry) entries.delete(key);
  });
  return entry.promise as Promise<T>;
}

export function getQueryTtl(path: string): number {
  if (path === "/api/workspaces") return 60_000;
  if (/^\/api\/(linkedin\/status|facebook\/connections)\?/.test(path)) return 15_000;
  if (/^\/api\/ai\/media\/library\/[a-f0-9]{24}$/i.test(path)) return 60_000;
  if (/^\/api\/ai\/workspaces\/[a-f0-9]{24}\/images\/[a-f0-9]{24}\/url$/i.test(path)) return 45_000;
  return 0;
}
