import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ProtectedLayout } from "../../app/ProtectedLayout";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const CURRENT_USER = {
  id: "u1",
  email: "admin@sunrise.test",
  firstName: "Adaobi",
  lastName: "Nwachukwu",
  role: "SCHOOL_ADMIN",
  status: "ACTIVE",
  lastLoginAt: null,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE" },
};

function renderShell() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<div>Login page marker</div>} />
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<div>Dashboard marker</div>} />
      </Route>
    </Routes>,
    { route: "/dashboard" },
  );
}

describe("AppShell", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    authStore.clear();
  });

  it("renders the school name from /auth/me in the sidebar", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return CURRENT_USER;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderShell();

    expect(await screen.findByText("Sunrise College")).toBeInTheDocument();
  });

  it("logging out clears auth state and redirects to /login", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return CURRENT_USER;
      if (path.includes("/auth/logout")) return undefined;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderShell();

    expect(await screen.findByRole("button", { name: "Adaobi Nwachukwu" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adaobi Nwachukwu" }));
    await user.click(screen.getByRole("menuitem", { name: "Log out" }));

    expect(await screen.findByText("Login page marker")).toBeInTheDocument();
    expect(authStore.getState()).toBeNull();
  });
});
