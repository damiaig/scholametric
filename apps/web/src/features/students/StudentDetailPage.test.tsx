import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Student } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { StudentDetailPage } from "./StudentDetailPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const SCHOOL_ADMIN_USER = {
  id: "u1",
  email: "admin@sunrise.test",
  firstName: "Adaobi",
  lastName: "Nwachukwu",
  role: "SCHOOL_ADMIN",
  status: "ACTIVE",
  lastLoginAt: null,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE" },
};

const TEACHER_USER = { ...SCHOOL_ADMIN_USER, role: "TEACHER" };

const STUDENT: Student = {
  id: "st-1",
  schoolId: "s1",
  admissionNumber: "SUN/2026/0001",
  firstName: "Oluwaseun",
  lastName: "Adeyemi",
  middleName: null,
  gender: "MALE",
  dateOfBirth: "2012-05-01T00:00:00.000Z",
  admittedOn: "2026-09-01T00:00:00.000Z",
  status: "ACTIVE",
  guardianName: "Guardian",
  guardianPhone: "+2348012345678",
  guardianEmail: null,
  address: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  currentEnrollment: {
    id: "e1",
    classArmId: "arm-1",
    sessionId: "sess-1",
    enrolledOn: "2026-09-01T00:00:00.000Z",
    classArm: { id: "arm-1", name: "A", classLevel: { id: "lvl-1", name: "JSS 2", rank: 2 } },
    session: { id: "sess-1", name: "2026/2027", isCurrent: true },
  },
};

function mockApi(role: string) {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return role === "TEACHER" ? TEACHER_USER : SCHOOL_ADMIN_USER;
    if (path.includes("/class-levels")) {
      return { items: [{ id: "lvl-1", schoolId: "s1", name: "JSS 2", rank: 2 }], total: 1, page: 1, pageSize: 100 };
    }
    if (path.includes("/class-arms")) {
      return { items: [{ id: "arm-1", schoolId: "s1", classLevelId: "lvl-1", name: "A" }], total: 1, page: 1, pageSize: 100 };
    }
    if (path === "/api/v1/students/st-1") return STUDENT;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

function renderDetailPage() {
  return renderWithProviders(<Routes><Route path="/students/:id" element={<StudentDetailPage />} /></Routes>, {
    route: "/students/st-1",
  });
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("StudentDetailPage", () => {
  it("TEACHER: Edit/Transfer/Withdraw buttons are absent", async () => {
    mockApi("TEACHER");
    renderDetailPage();

    expect(await screen.findByText("Oluwaseun Adeyemi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Transfer class/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Withdraw/ })).not.toBeInTheDocument();
  });

  it("SCHOOL_ADMIN: withdraw confirm button stays disabled until the surname is typed exactly", async () => {
    mockApi("SCHOOL_ADMIN");
    const user = userEvent.setup();
    renderDetailPage();

    await screen.findByText("Oluwaseun Adeyemi");
    await user.click(screen.getByRole("button", { name: /Withdraw/ }));

    // Two "Withdraw" buttons now exist: the page action and the dialog's own
    // confirm button (ConfirmDialog's confirmLabel="Withdraw") — the dialog's
    // is rendered last.
    await screen.findByRole("dialog", { name: "Withdraw student" });
    const confirm = () => screen.getAllByRole("button", { name: "Withdraw" }).slice(-1)[0];

    await user.type(screen.getByLabelText("Reason"), "Relocated");
    expect(confirm()).toBeDisabled();

    const typedConfirmInput = screen.getByLabelText(/Type/);
    await user.type(typedConfirmInput, "Wrong");
    expect(confirm()).toBeDisabled();

    await user.clear(typedConfirmInput);
    await user.type(typedConfirmInput, STUDENT.lastName);
    expect(confirm()).not.toBeDisabled();
  });
});
