import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test/render-with-providers";
import { authStore } from "../lib/auth-store";
import { apiRequest } from "../lib/api-client";
import { AppRoutes } from "../App";

// SPEC_V0.3.md §4 item 4: the frontend must enforce PASSWORD_CHANGE_REQUIRED
// itself (not just rely on the API's 403) so a flagged user never sees a
// flash of any other route's content. Exercises the real route tree
// (App.tsx's <AppRoutes>), same approach as route-smoke.test.tsx, because
// the guard lives in ProtectedLayout/ChangePasswordRoute, not in any one
// page component.
vi.mock("../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const BASE_USER = {
  id: "u2",
  email: "newteacher@sunrise.test",
  firstName: "New",
  lastName: "Teacher",
  role: "TEACHER" as const,
  status: "ACTIVE",
  lastLoginAt: null,
  school: {
    id: "s1",
    name: "Sunrise College",
    slug: "sunrise",
    type: "SECONDARY" as const,
    status: "ACTIVE" as const,
    address: null,
    phone: null,
    email: null,
  },
};

const EMPTY_TEACHING = { classTeacherOf: [], subjects: [] };

function renderApp(route: string) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("Forced password change (frontend enforcement)", () => {
  it("a flagged user is routed to /change-password even from an unrelated protected route, with no AppShell/sidebar", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/me") return { ...BASE_USER, mustChangePassword: true };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderApp("/students");

    expect(await screen.findByText("Choose your own password to continue")).toBeInTheDocument();
    expect(screen.queryByText("Sunrise College")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Students" })).not.toBeInTheDocument();
  });

  it("cannot navigate away: landing directly on /dashboard while flagged also redirects to /change-password", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/me") return { ...BASE_USER, mustChangePassword: true };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderApp("/dashboard");

    expect(await screen.findByText("Choose your own password to continue")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "My Classes" })).not.toBeInTheDocument();
  });

  it("successfully changing the password clears the flag and lands on home", async () => {
    let flagged = true;
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      const method = options?.method ?? "GET";
      if (path === "/api/v1/auth/me") return { ...BASE_USER, mustChangePassword: flagged };
      if (path === "/api/v1/auth/change-password" && method === "POST") {
        flagged = false;
        return { accessToken: "new-access-token", refreshToken: "new-refresh-token" };
      }
      if (path === "/api/v1/me/teaching") return EMPTY_TEACHING;
      throw new Error(`unexpected apiRequest call: ${method} ${path}`);
    });

    const user = userEvent.setup();
    renderApp("/dashboard");

    await screen.findByText("Choose your own password to continue");

    await user.type(screen.getByLabelText("Current password"), "Passw0rd!");
    await user.type(screen.getByLabelText("New password"), "NewPassw0rd!");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByRole("heading", { name: "My Classes" })).toBeInTheDocument();
    expect(screen.queryByText("Choose your own password to continue")).not.toBeInTheDocument();
  });

  it("a non-flagged user visiting /change-password directly is redirected home", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/me") return { ...BASE_USER, mustChangePassword: false };
      if (path === "/api/v1/me/teaching") return EMPTY_TEACHING;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderApp("/change-password");

    expect(await screen.findByRole("heading", { name: "My Classes" })).toBeInTheDocument();
    expect(screen.queryByText("Choose your own password to continue")).not.toBeInTheDocument();
  });
});
