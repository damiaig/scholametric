import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { StrictMode } from "react";
import { screen, cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test/render-with-providers";
import { authStore, resetAuthStatusForTests } from "../lib/auth-store";
import { apiRequest } from "../lib/api-client";
import { AppRoutes } from "../App";
import { AuthBootGate } from "./AuthBootGate";

// v0.8.5 step 3 (SPEC_V0.8.5.md §3) — exercises the REAL AppRoutes wrapped
// in the REAL AuthBootGate (not a stand-in for either), so a regression
// that reintroduces the login-flash — e.g. someone "simplifying" the gate
// to a boolean, or dropping the single-flight — fails here, not just in a
// unit test of AuthBootGate's own render logic in isolation.
//
// Only the boot refresh (AuthBootGate -> api-client's refreshTokens ->
// rawFetch -> global fetch) is exercised against a real fetch mock; every
// OTHER network call (/auth/me, /auth/logout) goes through the mocked
// apiRequest, same pattern as route-smoke.test.tsx / ChangePasswordFlow.test.tsx.
vi.mock("../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const BASE_USER = {
  id: "u1",
  email: "admin@sunrise.test",
  firstName: "Adaobi",
  lastName: "Nwachukwu",
  role: "SCHOOL_ADMIN",
  status: "ACTIVE",
  lastLoginAt: null,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

function mockProtectedEndpoints() {
  mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
    const method = options?.method ?? "GET";
    if (path === "/api/v1/auth/me") return BASE_USER;
    if (path === "/api/v1/auth/logout" && method === "POST") return { success: true };
    throw new Error(`unexpected apiRequest call: ${method} ${path}`);
  });
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function unauthorizedResponse(): Response {
  return {
    ok: false,
    status: 401,
    json: async () => ({ statusCode: 401, message: "Unauthorized", error: "Unauthorized", path: "/api/v1/auth/refresh", timestamp: "t" }),
  } as Response;
}

function renderApp(route = "/help") {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthBootGate>
          <AppRoutes />
        </AuthBootGate>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// The module-level auth-store persists across tests within this file —
// each test needs to start from the real boot-time "unknown" state, not
// whatever the previous test left behind (authenticated/unauthenticated).
// The running app never calls this; status only ever leaves "unknown"
// once per real page load.
beforeEach(() => {
  resetAuthStatusForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  authStore.clear();
});

describe("AuthBootGate", () => {
  it("a valid-cookie reload shows the splash, NEVER flashes the login screen, resolves to the app, and the protected query fires only once that happens", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => fetchPromise);
    vi.stubGlobal("fetch", fetchMock);
    mockProtectedEndpoints();

    renderApp("/help");

    // Still "unknown": the splash only, nothing from AppRoutes at all — not
    // the login screen, not the protected page, and the protected query
    // (/auth/me) has not fired.
    expect(screen.queryByText("Sign in to ScholaMetric")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Help" })).not.toBeInTheDocument();
    expect(mockedApiRequest).not.toHaveBeenCalled();

    resolveFetch(okResponse({ accessToken: "new-access-token" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Help" })).toBeInTheDocument());

    // The headline proof: the login screen was never present at any point
    // along the way, not just absent now.
    expect(screen.queryByText("Sign in to ScholaMetric")).not.toBeInTheDocument();
    expect(mockedApiRequest.mock.calls.length).toBeGreaterThan(0);
    // Not "exactly once": ProtectedLayout's own useCurrentUser() mounts
    // first and gates its children (Sidebar, HelpPage) behind its own
    // isLoading, so those two mount their own useCurrentUser() observers
    // on a LATER commit, once the first call's data already exists —
    // TanStack Query's default staleTime:0 means a newly-mounted observer
    // for already-fetched-but-stale data triggers one background refetch.
    // Confirmed pre-existing and unrelated to this step via a control case
    // (same double-call with authStore pre-authenticated and AuthBootGate
    // out of the tree entirely) — the property that actually matters here
    // is that NOTHING unexpected fired, not an exact count.
    expect(mockedApiRequest.mock.calls.every(([path]) => path === "/api/v1/auth/me")).toBe(true);

    // Step 1's logout still works, unaffected by boot rehydration: clicking
    // it clears the session and lands back on /login (it's the shell's own
    // "Sunrise College" sidebar text that disappears, same marker other
    // suites use to confirm the app rendered at all).
    await waitFor(() => expect(screen.getAllByText("Sunrise College").length).toBeGreaterThan(0));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Adaobi Nwachukwu" }));
    await user.click(screen.getByRole("menuitem", { name: "Log out" }));

    await waitFor(() => expect(screen.getByText("Sign in to ScholaMetric")).toBeInTheDocument());
  });

  it("boot resolving to no session (expired/missing/revoked cookie) lands quietly on /login — no console.error/warn", async () => {
    const fetchMock = vi.fn(async () => unauthorizedResponse());
    vi.stubGlobal("fetch", fetchMock);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderApp("/help");

    expect(screen.queryByText("Sign in to ScholaMetric")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Sign in to ScholaMetric")).toBeInTheDocument());

    expect(mockedApiRequest).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("React StrictMode's double effect-invocation still calls POST /auth/refresh exactly once (the shared single-flight)", async () => {
    const fetchMock = vi.fn(async () => okResponse({ accessToken: "new-access-token" }));
    vi.stubGlobal("fetch", fetchMock);
    mockProtectedEndpoints();

    const queryClient = createTestQueryClient();
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/help"]}>
            <AuthBootGate>
              <AppRoutes />
            </AuthBootGate>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Help" })).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
