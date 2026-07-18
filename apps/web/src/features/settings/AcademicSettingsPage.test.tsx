import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicSession, Paginated } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { AcademicSettingsPage } from "./AcademicSettingsPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

function paginated<T>(items: T[]): Paginated<T> {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

const CURRENT_SESSION: AcademicSession = {
  id: "sess-1",
  schoolId: "s1",
  name: "2026/2027",
  startsOn: "2026-09-01",
  endsOn: "2027-07-31",
  isCurrent: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const NEXT_SESSION: AcademicSession = {
  ...CURRENT_SESSION,
  id: "sess-2",
  name: "2027/2028",
  isCurrent: false,
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("AcademicSettingsPage", () => {
  it("creates a new session", async () => {
    const user = userEvent.setup();
    let sessions = [CURRENT_SESSION];

    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/sessions" && (!options?.method || options.method === "GET")) {
        return paginated(sessions);
      }
      if (path === "/api/v1/sessions" && options?.method === "POST") {
        const created = { ...NEXT_SESSION, ...(options.body as object) };
        sessions = [...sessions, created];
        return created;
      }
      if (path === "/api/v1/terms") {
        return paginated([]);
      }
      throw new Error(`unexpected apiRequest call: ${path} ${options?.method ?? "GET"}`);
    });

    renderWithProviders(<AcademicSettingsPage />);

    const table = await screen.findByRole("table");
    expect(within(table).getByText("2026/2027")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New session" }));
    await user.type(screen.getByLabelText("Name"), "2027/2028");
    await user.type(screen.getByLabelText("Starts on"), "2027-09-01");
    await user.type(screen.getByLabelText("Ends on"), "2028-07-31");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await within(table).findByText("2027/2028")).toBeInTheDocument();
  });

  it("activation dialog shows enrollment counts, warns on an empty target, and confirm stays disabled until the name is typed exactly", async () => {
    const user = userEvent.setup();

    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/api/v1/sessions" && (!options?.method || options.method === "GET")) {
        return paginated([CURRENT_SESSION, NEXT_SESSION]);
      }
      if (path === "/api/v1/sessions/sess-2/activation-preview") {
        return {
          targetSession: { name: "2027/2028", enrollmentCount: 0 },
          currentSession: { name: "2026/2027", enrollmentCount: 125 },
        };
      }
      if (path === "/api/v1/sessions/sess-2/activate" && options?.method === "POST") {
        return { ...NEXT_SESSION, isCurrent: true };
      }
      if (path === "/api/v1/terms") {
        return paginated([]);
      }
      throw new Error(`unexpected apiRequest call: ${path} ${options?.method ?? "GET"}`);
    });

    renderWithProviders(<AcademicSettingsPage />);

    const table = await screen.findByRole("table");
    expect(within(table).getByText("2027/2028")).toBeInTheDocument();

    const row = within(table).getByText("2027/2028").closest("tr");
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole("button", { name: /activate/i }));

    const dialog = await screen.findByRole("dialog", { name: "Activate session" });
    expect(within(dialog).getByText(/This will make/)).toBeInTheDocument();

    expect(await within(dialog).findByText("125 enrolled students")).toBeInTheDocument();
    expect(within(dialog).getByText("0 enrolled students")).toBeInTheDocument();
    expect(within(dialog).getByText(/has no enrolled students/)).toBeInTheDocument();

    const confirmButton = within(dialog).getByRole("button", { name: "Activate" });
    expect(confirmButton).toBeDisabled();

    const typedInput = within(dialog).getByLabelText(/Type/);
    await user.type(typedInput, "wrong name");
    expect(confirmButton).toBeDisabled();

    await user.clear(typedInput);
    await user.type(typedInput, "2027/2028");
    expect(confirmButton).not.toBeDisabled();

    await user.click(confirmButton);

    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/api/v1/sessions/sess-2/activate",
      expect.objectContaining({ method: "POST", body: { confirmName: "2027/2028" } }),
    );
  });
});
