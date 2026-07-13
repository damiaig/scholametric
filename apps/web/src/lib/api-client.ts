import type { ApiErrorBody, RefreshResponse } from "@scholametric/shared";
import { authStore } from "./auth-store";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | undefined;

  constructor(status: number, body: ApiErrorBody | undefined) {
    const message = Array.isArray(body?.message) ? body.message.join(" ") : body?.message;
    super(message || `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${API_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function rawFetch<T>(path: string, options: RequestOptions, accessToken?: string): Promise<T> {
  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
    throw new ApiError(response.status, body);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** For endpoints that don't require (or predate) an access token: login, refresh, schools/search. */
export function publicApiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return rawFetch<T>(path, options);
}

// Concurrent 401s must share ONE refresh call — our backend rotates the
// refresh token on every use and revokes the whole session on reuse, so two
// independent refresh calls racing each other would log the user out. See
// docs/DECISIONS.md.
let refreshPromise: Promise<RefreshResponse> | null = null;

function refreshTokens(): Promise<RefreshResponse> {
  if (refreshPromise) {
    return refreshPromise;
  }
  const current = authStore.getState();
  if (!current) {
    return Promise.reject(new Error("No refresh token available"));
  }
  refreshPromise = rawFetch<RefreshResponse>("/api/v1/auth/refresh", {
    method: "POST",
    body: { refreshToken: current.refreshToken },
  }).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** For authenticated endpoints: attaches the bearer token; on 401, refreshes once and retries once. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const tokens = authStore.getState();
  try {
    return await rawFetch<T>(path, options, tokens?.accessToken);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && tokens) {
      try {
        const refreshed = await refreshTokens();
        authStore.setTokens(refreshed);
        return await rawFetch<T>(path, options, refreshed.accessToken);
      } catch {
        authStore.clear();
        throw error;
      }
    }
    throw error;
  }
}

/** CLAUDE.md §6: user-facing errors are readable sentences, never raw API messages. */
export function getErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ApiError) {
    return error.message || fallback;
  }
  return fallback;
}
