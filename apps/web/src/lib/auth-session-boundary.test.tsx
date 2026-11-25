import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./query-client";
import { authStore } from "./auth-store";
import { apiRequest, publicApiRequest } from "./api-client";
import { useCurrentUser } from "../features/shell/use-current-user";
import { useLogin } from "../features/auth/use-login";

// v0.9 Item C (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — useCurrentUser()'s
// new 5-minute staleTime only works because the query cache is wiped at
// every session boundary; otherwise a second user logging in on the same
// tab (no logout in between — e.g. the first session ended via a
// definitive 401, not the logout button) could see the FIRST user's
// cached identity for up to 5 minutes. Uses the REAL app singleton
// queryClient (not a fresh per-test one from render-with-providers) —
// authStore.clear()/useLogin() both reach for that exact singleton in
// production (main.tsx wraps the whole app in ONE QueryClientProvider
// backed by it), so this is the one test file where using the singleton
// is correct, not a shortcut.
vi.mock("./api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api-client")>();
  return { ...actual, apiRequest: vi.fn(), publicApiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);
const mockedPublicApiRequest = vi.mocked(publicApiRequest);

const ALICE = {
  id: "u1",
  email: "alice@sunrise.test",
  firstName: "Alice",
  lastName: "Adeyemi",
  role: "SCHOOL_ADMIN",
  status: "ACTIVE",
  lastLoginAt: null,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

const BOB = { ...ALICE, id: "u2", email: "bob@sunrise.test", firstName: "Bob", lastName: "Balogun" };

function Harness() {
  const { data: user } = useCurrentUser();
  const login = useLogin();
  return (
    <div>
      <p data-testid="identity">{user ? user.firstName : "none"}</p>
      <button
        type="button"
        onClick={() => login.mutate({ schoolSlug: "sunrise", identifier: "bob", password: "Passw0rd!" })}
      >
        Log in as Bob
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("session boundary — the query cache never serves a previous session's identity into a new one", () => {
  it("authStore.clear() wipes the cached /auth/me identity, not just the token", async () => {
    mockedApiRequest.mockResolvedValue(ALICE);
    authStore.setTokens({ accessToken: "alice-token" });
    renderHarness();
    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("Alice"));

    act(() => authStore.clear());

    expect(queryClient.getQueryData(["auth", "me"])).toBeUndefined();
  });

  it("a second user's login shows the second user's identity immediately, not the first user's cached one", async () => {
    mockedApiRequest.mockResolvedValue(ALICE);
    authStore.setTokens({ accessToken: "alice-token" });
    const user = userEvent.setup();
    renderHarness();
    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("Alice"));

    // Alice's session ends abruptly (e.g. a definitive 401 on refresh) —
    // not the explicit logout button, same path api-client.ts's own
    // catch takes.
    act(() => authStore.clear());

    mockedPublicApiRequest.mockResolvedValue({ accessToken: "bob-token", user: BOB });
    mockedApiRequest.mockResolvedValue(BOB);
    await user.click(screen.getByRole("button", { name: "Log in as Bob" }));

    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("Bob"));
    expect(screen.queryByTestId("identity")).not.toHaveTextContent("Alice");
  });
});
