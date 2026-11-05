import type { ApiEnvelope } from "./types";

/**
 * The API is served by Express. In local development it runs on :5000, and in
 * Docker it is exposed on the same host. Cookies are sent with `credentials:
 * include`; the backend CORS config allows the dashboard origin.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000").replace(
  /\/$/,
  ""
);

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
