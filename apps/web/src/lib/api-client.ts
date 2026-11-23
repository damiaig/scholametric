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
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  // Some endpoints can legitimately 401 for a reason that has nothing to
  // do with the access token (e.g. POST /auth/change-password rejecting a
  // wrong currentPassword) — retrying with a refreshed token would just
  // 401 again for the same reason, and the fallback below would then
  // authStore.clear() the caller's perfectly valid session out from under
  // them. Callers that know their 401 means "the submitted data was
  // wrong," not "my token expired," opt out of the retry-then-logout path.
  skipAuthRetry?: boolean;
  /**
   * v0.8.5 step 1 (SPEC_V0.8.5.md §4) — extra headers merged into the
   * request, on top of Content-Type/Authorization. Used only to attach
   * the CSRF_HEADER on the two cookie-reliant auth calls (refresh,
   * logout) — regular API calls never need this, and adding a custom
   * header to EVERY request would force a CORS preflight on every single
   * call instead of just those two.
   */
  headers?: Record<string, string>;
}

// v0.8.5 step 1 (SPEC_V0.8.5.md §4) — the defense-in-depth CSRF header the
// backend's CsrfHeaderGuard requires on /auth/refresh and /auth/logout.
// Presence-only check server-side; this exact value is just the
// conventional one (matches what jQuery/XHR have historically auto-set).
export const CSRF_HEADER = { "X-Requested-With": "XMLHttpRequest" };

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
    // v0.8.5 step 1 (SPEC_V0.8.5.md §4) — required for the refresh cookie
    // to flow at all: a fetch without this won't send a cookie cross-
    // origin, and won't store one from a cross-origin Set-Cookie either
    // (dev's 5173 -> 3000 is cross-origin despite being same-site).
    // Unconditional and harmless on every other call — the cookie's own
    // Path=/auth means it's simply never sent/received outside auth
    // endpoints regardless.
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
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
//
// v0.8.5 step 1 (SPEC_V0.8.5.md §2) — the refresh token itself is never
// read from or sent in a body anymore; it rides along automatically as
// the httpOnly cookie (credentials:"include" on rawFetch is what makes
// that happen).
//
// v0.8.5 step 3 (SPEC_V0.8.5.md §3) — exported so AuthBootGate can call this
// exact function on boot. There's deliberately no "is there an access token
// in memory" guard here anymore: boot calls this with NOTHING in memory yet
// (that's the whole point — asking the cookie for one), and the single
// `refreshPromise` below is what makes boot and any mid-session 401-retry
// share one in-flight call either way. The only other caller (apiRequest's
// catch branch, below) already checks its own `tokens` before ever reaching
// this function, so removing the guard here changes nothing for it.
let refreshPromise: Promise<RefreshResponse> | null = null;

/** v0.9 Step 2c — how long to wait before the one retry below. */
const REFRESH_RETRY_DELAY_MS = 300;

function isRetryableApiError(error: unknown): boolean {
  return error instanceof ApiError && error.body?.retryable === true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// v0.9 Step 2c (docs/DECISIONS.md) — advisory-lock/row-lock contention on
// the backend's own refresh-rotation row can now return a retryable 409/503
// (common/filters/all-exceptions.filter.ts) instead of hanging. That is NOT
// "this session is invalid" — it is the server/network being transiently
// busy, same bug class as a dropped request, and must not be treated as a
// logout. ONE retry here, inside the single-flight promise every caller
// (AuthBootGate, apiRequest's 401-retry) already shares, so every current
// waiter benefits from the same retry rather than each needing its own
// logic. The retry is a genuinely fresh request (not a replay of the first
// one's in-flight state) — in a real browser, `credentials:"include"`
// always sends whatever the cookie jar holds AT SEND TIME, so if the
// original attempt raced a concurrent refresh and lost, the browser's
// cookie jar has very likely already been updated to that concurrent
// request's freshly-rotated cookie by the time this retry fires, and the
// retry picks THAT up automatically — proved end-to-end at the backend
// level in auth-refresh-lock-timeout.e2e-spec.ts. If the retry ALSO fails
// retryably (or with anything other than a definitive 401), the error is
// left for the caller to decide what to do — see apiRequest and
// AuthBootGate, neither of which clears the session for it.
export async function refreshTokens(): Promise<RefreshResponse> {
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = (async () => {
    try {
      return await rawFetch<RefreshResponse>("/api/v1/auth/refresh", { method: "POST", headers: CSRF_HEADER });
    } catch (error) {
      if (!isRetryableApiError(error)) {
        throw error;
      }
      await sleep(REFRESH_RETRY_DELAY_MS);
      return await rawFetch<RefreshResponse>("/api/v1/auth/refresh", { method: "POST", headers: CSRF_HEADER });
    }
  })().finally(() => {
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
    if (error instanceof ApiError && error.status === 401 && tokens && !options.skipAuthRetry) {
      try {
        const refreshed = await refreshTokens();
        authStore.setTokens(refreshed);
        return await rawFetch<T>(path, options, refreshed.accessToken);
      } catch (refreshError) {
        // v0.9 Step 2c — only a DEFINITIVE rejection (the server saying
        // this session's refresh token is actually invalid/expired/
        // reused) means the user is really logged out. Anything else —
        // refreshTokens()'s own retryable 409/503 even after its one
        // internal retry, a network error, or an unrelated 5xx — is the
        // server/network being transiently unavailable, not proof the
        // session is invalid, so the session is left intact (the caller
        // sees the ORIGINAL 401 and decides what to show).
        if (refreshError instanceof ApiError && refreshError.status === 401) {
          authStore.clear();
        }
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
