import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Paginated, PersonnelSummary } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { PersonnelListPage } from "./PersonnelListPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

function personnel(overrides: Partial<PersonnelSummary> = {}): PersonnelSummary {
  return {
    id: "p-1",
    schoolId: "s1",
    email: "bola@sunrise.test",
    firstName: "Bola",
    lastName: "Ogundare",
    role: "TEACHER",
    status: "ACTIVE",
    lastLoginAt: null,
    staffProfileId: "sp-1",
    staffNumber: "SUN/STF/0001",
    jobTitle: "VICE_PRINCIPAL",
    phone: null,
    qualification: null,
    dateEmployed: null,
    ...overrides,
  };
}

function paginated(items: PersonnelSummary[]): Paginated<PersonnelSummary> {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

function mockApi(handler?: (path: string, opts?: { method?: string }) => unknown) {
  mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
    if (path.includes("/personnel") && (!opts?.method || opts.method === "GET")) {
      return paginated([personnel()]);
    }
    if (handler) {
      const result = handler(path, opts);
      if (result !== undefined) return result;
    }
    throw new Error(`unexpected apiRequest call: ${path} ${opts?.method ?? "GET"}`);
  });
}

async function findTable() {
  return screen.findByRole("table");
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("PersonnelListPage", () => {
  it("renders staff rows with staff number and role/title columns", async () => {
    mockApi();
    renderWithProviders(<PersonnelListPage />);

    const table = within(await findTable());
    expect(table.getByText("Bola Ogundare")).toBeInTheDocument();
    expect(table.getByText("SUN/STF/0001")).toBeInTheDocument();
    expect(table.getByText("Teacher")).toBeInTheDocument();
    expect(table.getByText("Vice Principal")).toBeInTheDocument();
  });

  it("New staff member drawer: shows the role/title explainer and per-field validation", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<PersonnelListPage />);
    await findTable();

    await user.click(screen.getByRole("button", { name: /New staff member/ }));

    expect(
      screen.getByText("Role controls what they can do; title is their position in the school."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("First name is required")).toBeInTheDocument();
    expect(screen.getByText("Last name is required")).toBeInTheDocument();
    expect(screen.getByText("Select a role")).toBeInTheDocument();
    expect(screen.getByText("Select a title")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
  });

  it("reset-password dialog shows the one-time password after confirming", async () => {
    mockApi((path, opts) => {
      if (path.includes("/reset-password") && opts?.method === "POST") {
        return { temporaryPassword: "Sup3rSecret!" };
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderWithProviders(<PersonnelListPage />);
    await findTable();

    await user.click(screen.getByRole("button", { name: "Reset password for Bola Ogundare" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Sup3rSecret!")).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/)).toBeInTheDocument();
  });
});
