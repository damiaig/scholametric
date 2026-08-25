import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { ApiError, apiRequest } from "../../lib/api-client";
import { AccountChangePasswordPage } from "./AccountChangePasswordPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const OLD_PASSWORD = "OldPassw0rd!";
const NEW_PASSWORD = "BrandNewPassw0rd!";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

// v0.6 step 6 (SPEC_V0.6.md §5 step 6) — a VOLUNTARY entry point to the
// SAME POST /auth/change-password the forced flow already uses (no new
// backend behavior). The mock below models the real backend's actual
// state transition (old password rejected, new one accepted) the same
// way portal-accounts-reissue.e2e-spec.ts proves it live — here at the
// mock layer, since this page itself never calls /auth/login.
describe("AccountChangePasswordPage", () => {
  it("voluntary change succeeds, shows confirmation, and the mocked backend now rejects the old password while accepting the new one", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });

    let currentPassword = OLD_PASSWORD;
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/auth/change-password" && method === "POST") {
        const body = (options as { body: { currentPassword: string; newPassword: string } }).body;
        if (body.currentPassword !== currentPassword) {
          throw new ApiError(401, {
            statusCode: 401,
            message: "Current password is incorrect.",
            error: "Unauthorized",
            path: "/api/v1/auth/change-password",
            timestamp: new Date().toISOString(),
          });
        }
        currentPassword = body.newPassword;
        return { accessToken: "new-access-token", refreshToken: "new-refresh-token" };
      }
      if (path === "/api/v1/auth/login" && method === "POST") {
        const body = (options as { body: { password: string } }).body;
        if (body.password !== currentPassword) {
          throw new ApiError(401, {
            statusCode: 401,
            message: "Invalid email/username, password, or school.",
            error: "Unauthorized",
            path: "/api/v1/auth/login",
            timestamp: new Date().toISOString(),
          });
        }
        return { accessToken: "login-access-token", refreshToken: "login-refresh-token", user: { mustChangePassword: false } };
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<AccountChangePasswordPage />);

    await user.type(screen.getByLabelText("Current password"), OLD_PASSWORD);
    await user.type(screen.getByLabelText("New password"), NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Password changed.")).toBeInTheDocument();

    // The tokens the mutation returned are now the ones in use.
    await waitFor(() => expect(authStore.getState()).toEqual({ accessToken: "new-access-token", refreshToken: "new-refresh-token" }));

    // Old password now rejected; new one works — same guarantee proven
    // live for reissue in portal-accounts-reissue.e2e-spec.ts.
    await expect(
      apiRequest("/api/v1/auth/login", { method: "POST", body: { identifier: "admin@sunrise.test", password: OLD_PASSWORD, schoolSlug: "sunrise" } }),
    ).rejects.toThrow(ApiError);
    await expect(
      apiRequest("/api/v1/auth/login", { method: "POST", body: { identifier: "admin@sunrise.test", password: NEW_PASSWORD, schoolSlug: "sunrise" } }),
    ).resolves.toMatchObject({ accessToken: "login-access-token" });
  });

  it("wrong current password shows the API's error message, not a silent no-op", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/auth/change-password" && method === "POST") {
        throw new ApiError(401, {
          statusCode: 401,
          message: "Current password is incorrect.",
          error: "Unauthorized",
          path: "/api/v1/auth/change-password",
          timestamp: new Date().toISOString(),
        });
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<AccountChangePasswordPage />);

    await user.type(screen.getByLabelText("Current password"), "wrong-password");
    await user.type(screen.getByLabelText("New password"), NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(screen.queryByText("Password changed.")).not.toBeInTheDocument();
  });
});
