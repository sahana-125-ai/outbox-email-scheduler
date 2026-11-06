import type { ApiEnvelope } from "./types";

/**
 * Requests go to the same origin by default. Next.js proxies `/api/*` to the
 * Express service using the server-only `BACKEND_URL`, which keeps session
 * cookies first-party and avoids CORS in every environment.
 *
 * Set NEXT_PUBLIC_API_URL only when the browser must call the API directly.
 */
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
export const API_URL = (configuredApiUrl ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store"
    });
  } catch {
    throw new ApiError(
      "Cannot reach the API. Is the backend running on " + API_URL + "?",
      0
    );
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  // A stale session should send the user back to the sign-in screen once.
  if (
    response.status === 401 &&
    typeof window !== "undefined" &&
    window.location.pathname !== "/"
  ) {
    window.location.href = "/";
  }

  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      payload?.message || `Request failed with status ${response.status}`,
      response.status,
      payload?.errors
    );
  }

  return (payload ?? { success: true, data: null as T }) as ApiEnvelope<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" })
};

export function backendUrl(path: string): string {
  return `${API_URL}${path}`;
}
