import { supabase } from "@/lib/supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:4000";

export class ApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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

  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `API request failed with status ${response.status}.`;

    try {
      const body = (await response.json()) as ApiErrorResponse;
      message = body.message || body.error || message;
    } catch {
      // Keep the fallback message if the response isn't JSON.
    }

    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}
