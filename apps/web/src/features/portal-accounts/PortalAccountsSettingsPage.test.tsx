import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Paginated, PortalAccountSummary, ProvisionResult, ReissuedPortalAccount } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { PortalAccountsSettingsPage } from "./PortalAccountsSettingsPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const ADMIN_USER = {
  id: "u1",
  email: "admin@sunrise.test",
  firstName: "Adaobi",
  lastName: "Nwachukwu",
  role: "SCHOOL_ADMIN",
  status: "ACTIVE",
  lastLoginAt: null,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

const ACCOUNTS: Paginated<PortalAccountSummary> = {
  items: [
    { id: "acc1", role: "STUDENT", username: "OKAFOR1", displayName: "Chidi Okafor", studentId: "st1", guardianId: null, mustChangePassword: true, createdAt: "t" },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

const PROVISION_RESULT: ProvisionResult = {
  studentsCreated: [{ id: "acc2", username: "BELLO1", tempPassword: "998877", studentId: "st2" }],
  parentsCreated: [],
  alreadyProvisioned: { students: 1, parents: 1 },
  warnings: [{ type: "no_guardian", studentId: "st2", message: "Tunde Bello has no guardian on record — no parent account was created." }],
};

const REISSUED: ReissuedPortalAccount = {
  id: "acc1",
  role: "STUDENT",
  username: "OKAFOR1",
  displayName: "Chidi Okafor",
  studentId: "st1",
  guardianId: null,
  mustChangePassword: true,
  createdAt: "t",
  tempPassword: "224466",
};

function mockCommon() {
  mockedApiRequest.mockImplementation(async (path, options) => {
    const method = (options as { method?: string })?.method;
    if (path === "/api/v1/auth/me") return ADMIN_USER;
    if (path === "/api/v1/portal-accounts" && (method ?? "GET") === "GET") return ACCOUNTS;
    if (path === "/api/v1/portal-accounts/provision" && method === "POST") return PROVISION_RESULT;
    if (path === "/api/v1/portal-accounts/acc1/reissue" && method === "POST") return REISSUED;
    throw new Error(`unexpected call: ${path}`);
  });
}

function renderPage() {
  return renderWithProviders(<PortalAccountsSettingsPage />);
}

async function findTable() {
  return within(await screen.findByRole("table"));
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("PortalAccountsSettingsPage", () => {
  it("lists provisioned accounts", async () => {
    mockCommon();
    renderPage();

    const table = await findTable();
    expect(table.getByText("Chidi Okafor")).toBeInTheDocument();
    expect(table.getByText("OKAFOR1")).toBeInTheDocument();
  });

  it("provisioning shows the created-count summary and any warnings", async () => {
    mockCommon();
    const user = userEvent.setup();
    renderPage();

    await findTable();
    await user.click(screen.getByRole("button", { name: "Provision portal accounts" }));

    expect(await screen.findByText(/Created 1 student and 0 parent\/guardian account/)).toBeInTheDocument();
    expect(screen.getByText(/Tunde Bello has no guardian on record/)).toBeInTheDocument();
  });

  it("reset & print generates a fresh temp password and shows a printable slip", async () => {
    mockCommon();
    const user = userEvent.setup();
    renderPage();

    const table = await findTable();
    await user.click(table.getByRole("button", { name: "Reset & print for Chidi Okafor" }));

    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Reset & print" }));

    expect(await screen.findByText("224466")).toBeInTheDocument();
  });
});
