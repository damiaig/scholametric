import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { BatchReissueResult, ClassArmDetail } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ClassArmCredentialSlipsPage } from "./ClassArmCredentialSlipsPage";

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

const ARM: ClassArmDetail = {
  id: "arm1",
  name: "A",
  classLevel: { id: "lvl1", name: "JSS 1", rank: 1 },
  classTeacher: null,
  subjectTeachers: [],
  students: { items: [], total: 0, page: 1, pageSize: 1 },
};

const BATCH_RESULT: BatchReissueResult = {
  classArmId: "arm1",
  reissued: [
    { id: "acc1", role: "STUDENT", username: "OKAFOR1", displayName: "Chidi Okafor", studentId: "st1", guardianId: null, mustChangePassword: true, createdAt: "t", tempPassword: "483920" },
    { id: "acc2", role: "PARENT", username: "OKAFOR", displayName: "Ngozi Okafor", studentId: null, guardianId: "g1", mustChangePassword: true, createdAt: "t", tempPassword: "110293" },
  ],
  skipped: [
    { id: "acc3", username: "BELLO1", displayName: "Tunde Bello", reason: "already_changed_password" },
    { id: "st2", username: null, displayName: "Amina Yusuf", reason: "not_provisioned" },
  ],
};

function mockCommon(overrides: { batch?: (force: boolean) => BatchReissueResult } = {}) {
  mockedApiRequest.mockImplementation(async (path, options) => {
    const method = (options as { method?: string })?.method;
    if (path === "/api/v1/auth/me") return ADMIN_USER;
    if (path === "/api/v1/class-arms/arm1") return ARM;
    if (path === "/api/v1/portal-accounts/class-arms/arm1/reissue" && method === "POST") {
      const body = (options as { body?: { force?: boolean } })?.body;
      return overrides.batch ? overrides.batch(Boolean(body?.force)) : BATCH_RESULT;
    }
    throw new Error(`unexpected call: ${path}`);
  });
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/classes/arms/:id/credential-slips" element={<ClassArmCredentialSlipsPage />} />
    </Routes>,
    { route: "/classes/arms/arm1/credential-slips" },
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

describe("ClassArmCredentialSlipsPage", () => {
  it("never calls the reissue endpoint just from navigating here — only an explicit click does", async () => {
    mockCommon();
    renderPage();

    await screen.findByText("Generate slips");
    expect(mockedApiRequest).not.toHaveBeenCalledWith("/api/v1/portal-accounts/class-arms/arm1/reissue", expect.anything());
  });

  it("renders printable slips and the skipped list with reasons — never hiding the skipped list", async () => {
    mockCommon();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Generate slips"));

    expect(await screen.findByText("Chidi Okafor")).toBeInTheDocument();
    expect(screen.getByText("483920")).toBeInTheDocument();
    expect(screen.getByText("Ngozi Okafor")).toBeInTheDocument();
    expect(screen.getByText("110293")).toBeInTheDocument();

    expect(screen.getByText("Not included (2)")).toBeInTheDocument();
    expect(screen.getByText("Tunde Bello")).toBeInTheDocument();
    expect(screen.getByText("Already changed their password")).toBeInTheDocument();
    expect(screen.getByText("Amina Yusuf")).toBeInTheDocument();
    expect(screen.getByText("Not yet provisioned")).toBeInTheDocument();
  });

  it("force reset requires typed confirmation naming the blast radius before calling force:true", async () => {
    mockCommon();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Generate slips"));
    await screen.findByText("Chidi Okafor");

    await user.click(screen.getByRole("button", { name: /Force reset 1 account/ }));
    expect(await screen.findByText(/This resets the password for 1 famil/)).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: "Force reset" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Type/), "JSS 1 A");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    await waitFor(() =>
      expect(mockedApiRequest).toHaveBeenCalledWith(
        "/api/v1/portal-accounts/class-arms/arm1/reissue",
        expect.objectContaining({ body: { force: true } }),
      ),
    );
  });

  // v0.6 step 6 polish: when every account is skipped, the printable area
  // must say so rather than rendering silent blank space above the
  // skipped-with-reasons list.
  it("all-skipped batch: shows 'Nothing to print' instead of a blank printable area", async () => {
    mockCommon({
      batch: () => ({
        classArmId: "arm1",
        reissued: [],
        skipped: [{ id: "acc3", username: "BELLO1", displayName: "Tunde Bello", reason: "already_changed_password" }],
      }),
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Generate slips"));

    expect(await screen.findByText(/Nothing to print/)).toBeInTheDocument();
    expect(screen.getByText("Tunde Bello")).toBeInTheDocument();
    expect(screen.queryByText("483920")).not.toBeInTheDocument();
  });
});
