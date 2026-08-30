import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { authStore } from "./auth-store";
import { apiRequest } from "./api-client";

interface MockResponse {
  status: number;
  body?: unknown;
}

function mockFetchSequence(responses: MockResponse[]) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
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
  authStore.setTokens({ accessToken: "old-access-token", refreshToken: "old-refresh-token" });
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
    expect(authStore.getState()).toEqual({ accessToken: "old-access-token", refreshToken: "old-refresh-token" });
  });

  it("without skipAuthRetry, a 401 still refreshes and retries once — existing token-expiry recovery is unaffected", async () => {
    mockFetchSequence([
      { status: 401, body: { statusCode: 401, message: "Unauthorized", error: "Unauthorized", path: "/api/v1/x", timestamp: "t" } },
      { status: 200, body: { accessToken: "new-access-token", refreshToken: "new-refresh-token" } },
      { status: 200, body: { ok: true } },
    ]);

    const result = await apiRequest("/api/v1/x", {});

    expect(result).toEqual({ ok: true });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(authStore.getState()).toEqual({ accessToken: "new-access-token", refreshToken: "new-refresh-token" });
  });

  it("without skipAuthRetry, a 401 that ALSO fails on retry clears the session (the legitimate expired-and-unrecoverable case)", async () => {
    mockFetchSequence([
      { status: 401, body: { statusCode: 401, message: "Unauthorized", error: "Unauthorized", path: "/api/v1/x", timestamp: "t" } },
      { status: 401, body: { statusCode: 401, message: "Unauthorized", error: "Unauthorized", path: "/api/v1/auth/refresh", timestamp: "t" } },
    ]);

    await expect(apiRequest("/api/v1/x", {})).rejects.toMatchObject({ status: 401 });
    expect(authStore.getState()).toBeNull();
  });
});
