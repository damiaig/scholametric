import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Paginated, StaffUser } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { UsersSettingsPage } from "./UsersSettingsPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

function paginated<T>(items: T[]): Paginated<T> {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

const ADMIN: StaffUser = {
  id: "u1",
  schoolId: "s1",
  email: "admin@sunrise.test",
  firstName: "Adaobi",
  lastName: "Nwachukwu",
  role: "SCHOOL_ADMIN",
  status: "ACTIVE",
  lastLoginAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("UsersSettingsPage", () => {
  it("creates a user and shows the one-time temporary password, then reflects the new row", async () => {
    const user = userEvent.setup();
    let users = [ADMIN];

    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/users" && (!options?.method || options.method === "GET")) {
        return paginated(users);
      }
      if (path === "/api/v1/users" && options?.method === "POST") {
        const body = options.body as { email: string; firstName: string; lastName: string; role: string };
        const created: StaffUser = { ...ADMIN, id: "u2", ...body, role: body.role as StaffUser["role"] };
        users = [...users, created];
        return { user: created, temporaryPassword: "Xk7mQp2Rst9L" };
      }
      throw new Error(`unexpected apiRequest call: ${path} ${options?.method ?? "GET"}`);
    });

    renderWithProviders(<UsersSettingsPage />);

    const table = await screen.findByRole("table");
    expect(within(table).getByText("admin@sunrise.test")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /new user/i }));
    await user.type(screen.getByLabelText("First name"), "New");
    await user.type(screen.getByLabelText("Last name"), "Teacher");
    await user.type(screen.getByLabelText("Email"), "new.teacher@sunrise.test");
    await user.selectOptions(screen.getByLabelText("Role", { exact: true }), "TEACHER");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText("Xk7mQp2Rst9L")).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^done$/i }));

    expect(await within(table).findByText("new.teacher@sunrise.test")).toBeInTheDocument();
  });

  it("resets a user's password behind a confirm step, then shows it once", async () => {
    const user = userEvent.setup();

    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/api/v1/users" && (!options?.method || options.method === "GET")) {
        return paginated([ADMIN]);
      }
      if (path === "/api/v1/users/u1/reset-password" && options?.method === "POST") {
        return { temporaryPassword: "Zb3nWq8Hjk4M" };
      }
      throw new Error(`unexpected apiRequest call: ${path} ${options?.method ?? "GET"}`);
    });

    renderWithProviders(<UsersSettingsPage />);

    await user.click(await screen.findByRole("button", { name: "Reset password for Adaobi Nwachukwu" }));

    const dialog = await screen.findByRole("dialog", { name: "Reset password" });
    expect(within(dialog).getByText(/generates a new temporary password/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Zb3nWq8Hjk4M")).toBeInTheDocument();
  });
});
