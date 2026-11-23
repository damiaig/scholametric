import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { authStore } from "./auth-store";
import { apiRequest, publicApiRequest } from "./api-client";

interface MockResponse {
  status: number;
  body?: unknown;
}

// v0.8.5 step 1 (SPEC_V0.8.5.md §2/§4) — captures each call's full init so
// tests can assert on it (no body, the CSRF header, credentials:"include")
// rather than only on the sequence of responses.
const fetchCalls: [string, RequestInit | undefined][] = [];

function mockFetchSequence(responses: MockResponse[]) {
  let call = 0;
  fetchCalls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push([url, init]);
      const response = responses[call++];
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => response.body,
      } as Response;
    }),
  );
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "old-access-token" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  authStore.clear();
});

// v0.6 acceptance-walk fix 2 (docs/DECISIONS.md) — a wrong currentPassword
// on POST /auth/change-password 401s for a reason that has nothing to do
// with token expiry. Before skipAuthRetry existed, apiRequest treated
// every 401 as "refresh and retry once," the retry 401s again for the
// SAME reason, and the fallback cleared the caller's perfectly valid
// session — a silent logout underneath an error message that otherwise
// looked handled.
describe("apiRequest — 401 handling", () => {
  it("skipAuthRetry: a 401 throws directly, without refreshing or clearing a valid session", async () => {
    mockFetchSequence([
      {
        status: 401,
        body: { statusCode: 401, message: "Current password is incorrect.", error: "Unauthorized", path: "/api/v1/auth/change-password", timestamp: "t" },
      },
    ]);

    await expect(
      apiRequest("/api/v1/auth/change-password", { method: "POST", body: {}, skipAuthRetry: true }),
    ).rejects.toMatchObject({ status: 401, message: "Current password is incorrect." });

    // Exactly one fetch call — no refresh attempt was made.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    // The bug this guards against: the caller's session must still be intact.
    expect(authStore.getState()).toEqual({ accessToken: "old-access-token" });
  });

  it("without skipAuthRetry, a 401 still refreshes and retries once — existing token-expiry recovery is unaffected", async () => {
    mockFetchSequence([
      { status: 401, body: { statusCode: 401, message: "Unauthorized", error: "Unauthorized", path: "/api/v1/x", timestamp: "t" } },
      { status: 200, body: { accessToken: "new-access-token" } },
      { status: 200, body: { ok: true } },
    ]);

    const result = await apiRequest("/api/v1/x", {});

    expect(result).toEqual({ ok: true });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(authStore.getState()).toEqual({ accessToken: "new-access-token" });
  });

  // v0.8.5 step 1 (SPEC_V0.8.5.md §2/§4) — the refresh token is never read
  // from or sent in a body: it rides the httpOnly cookie automatically via
  // credentials:"include", and the CSRF header is required on this call.
  it("the silent refresh call sends no body, includes the CSRF header, and uses credentials: include", async () => {
    mockFetchSequence([
      { status: 401, body: { statusCode: 401, message: "Unauthorized", error: "Unauthorized", path: "/api/v1/x", timestamp: "t" } },
      { status: 200, body: { accessToken: "new-access-token" } },
      { status: 200, body: { ok: true } },
    ]);

    await apiRequest("/api/v1/x", {});

    const [refreshUrl, refreshInit] = fetchCalls[1];
    expect(refreshUrl).toContain("/api/v1/auth/refresh");
    expect(refreshInit?.body).toBeUndefined();
    expect(refreshInit?.credentials).toBe("include");
    expect(refreshInit?.headers).toMatchObject({ "X-Requested-With": "XMLHttpRequest" });
  });

  it("without skipAuthRetry, a 401 that ALSO fails on retry clears the session (the legitimate expired-and-unrecoverable case)", async () => {
    mockFetchSequence([
      { status: 401, body: { statusCode: 401, message: "Unauthorized", error: "Unauthorized", path: "/api/v1/x", timestamp: "t" } },
      { status: 401, body: { statusCode: 401, message: "Unauthorized", error: "Unauthorized", path: "/api/v1/auth/refresh", timestamp: "t" } },
    ]);

    await expect(apiRequest("/api/v1/x", {})).rejects.toMatchObject({ status: 401 });
    expect(authStore.getState()).toBeNull();
  });

  // v0.9 Step 2c hard requirement: advisory-lock/row-lock contention on the
  // backend's refresh rotation (common/filters/all-exceptions.filter.ts)
  // now maps to a retryable 409/503 instead of hanging — that is NOT proof
  // the session is invalid, and must not clear it. Covers refreshTokens()'s
  // own internal retry ALSO failing retryably (two retryable responses:
  // the original refresh attempt and its one internal retry), so the
  // session stays intact even when the transient condition persists a
  // little past the one built-in retry.
  it("a 401 whose refresh attempt gets a retryable 409 (even after refreshTokens()'s own retry) leaves the session intact", async () => {
    mockFetchSequence([
      { status: 401, body: { statusCode: 401, message: "Unauthorized", error: "Unauthorized", path: "/api/v1/x", timestamp: "t" } },
      {
        status: 409,
        body: {
          statusCode: 409,
          message: "Another save for this record is already in progress. Please try again in a moment.",
          error: "Conflict",
          path: "/api/v1/auth/refresh",
          timestamp: "t",
          retryable: true,
        },
      },
      {
        status: 409,
        body: {
          statusCode: 409,
          message: "Another save for this record is already in progress. Please try again in a moment.",
          error: "Conflict",
          path: "/api/v1/auth/refresh",
          timestamp: "t",
          retryable: true,
        },
      },
    ]);

    await expect(apiRequest("/api/v1/x", {})).rejects.toMatchObject({ status: 401 });
    // The ORIGINAL 401 is what the caller sees (same as before this step),
    // but — unlike the genuinely-expired case above — the session itself
    // is untouched, since nothing ever proved it invalid.
    expect(authStore.getState()).not.toBeNull();
  });

  // Same principle, a different failure shape: a network error on the
  // refresh attempt (not even an HTTP response) is just as much "the
  // server/network is unavailable right now," not "you are logged out."
  it("a 401 whose refresh attempt fails with a network error (not even an HTTP response) also leaves the session intact", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ statusCode: 401, message: "Unauthorized", error: "Unauthorized", path: "/api/v1/x", timestamp: "t" }),
          } as Response;
        }
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(apiRequest("/api/v1/x", {})).rejects.toMatchObject({ status: 401 });
    expect(authStore.getState()).not.toBeNull();
  });
});

// v0.8.5 bugfix (docs/DECISIONS.md, 2026-11-11) — a real browser only
// stores a cross-origin Set-Cookie from a response to a request that was
// ITSELF credentialed. The refresh call's credentials:"include" was
// already covered above, but LOGIN's never was, and a login response is
// exactly the one that sets the cookie in the first place — if that
// specific call ever lost credentials:"include" (e.g. someone "simplified"
// rawFetch to only include it conditionally), the refresh cookie would
// never be stored at all, and this suite's own mocked fetch wouldn't catch
// it since it doesn't model real browser cookie-jar/CORS behavior. This
// asserts the actual RequestInit every entry point sends, not just one of
// them.
describe("credentials: \"include\" is unconditional on every call (rawFetch), not just refresh", () => {
  it("publicApiRequest — the path login uses — sends credentials: include", async () => {
    mockFetchSequence([{ status: 200, body: { accessToken: "t", user: {} } }]);

    await publicApiRequest("/api/v1/auth/login", { method: "POST", body: { identifier: "a", password: "b" } });

    const [, init] = fetchCalls[0];
    expect(init?.credentials).toBe("include");
  });

  it("apiRequest's own direct (non-retry) call also sends credentials: include", async () => {
    mockFetchSequence([{ status: 200, body: { ok: true } }]);

    await apiRequest("/api/v1/x", {});

    const [, init] = fetchCalls[0];
    expect(init?.credentials).toBe("include");
  });
});
