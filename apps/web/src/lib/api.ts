import { cachedQuery, clearQueryCache, getQueryTtl } from "@/lib/queryCache";
import { supabase } from "@/lib/supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:4000";

export class ApiError extends Error {
  public readonly status: number;
  public readonly retryAfterMs?: number;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  init.signal?.throwIfAborted();
  const { data, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new ApiError("Unable to retrieve the authentication session.", 401);
  }

  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new ApiError("You must sign in to access this resource.", 401);
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const method = (init.method ?? "GET").toUpperCase();
  const mutation = method !== "GET" && method !== "HEAD";
  const ttl = !mutation && !init.signal && init.cache !== "no-store" ? getQueryTtl(normalizedPath) : 0;
  if (mutation || init.cache === "no-store") clearQueryCache();
  const load = async (): Promise<T> => {
    init.signal?.throwIfAborted();
    const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
      ...init,
      headers,
      credentials: init.credentials ?? "same-origin",
    });

    if (!response.ok) {
      let message = `API request failed with status ${response.status}.`;

      try {
        const body = (await response.json()) as ApiErrorResponse;
        message = body.message || body.error || message;
      } catch {
        // Keep the fallback message if the response isn't JSON.
      }

      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const retryAfterMs = Number.isFinite(seconds)
        ? Math.max(0, seconds * 1000)
        : retryAfter ? Math.max(0, Date.parse(retryAfter) - Date.now()) : undefined;
      throw new ApiError(message, response.status, retryAfterMs);
    }

    return (await response.json()) as T;
  };
  try {
    // Token scope prevents cached private data crossing accounts or sessions.
    return await (ttl ? cachedQuery(`${accessToken}:${normalizedPath}`, load, ttl) : load());
  } finally {
    if (mutation) clearQueryCache();
  }
}
