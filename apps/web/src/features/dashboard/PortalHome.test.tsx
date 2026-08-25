import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { PortalHome } from "./PortalHome";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const BASE_USER = {
  id: "u1",
  email: null,
  firstName: "Chidi",
  lastName: "Okafor",
  status: "ACTIVE",
  lastLoginAt: null,
  mustChangePassword: false,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

const TERM_ID = "term-1";
const SESSION_ID = "session-1";

const REPORT_CARD = {
  studentId: "st1",
  firstName: "Chidi",
  lastName: "Okafor",
  admissionNumber: "SUN/2026/0099",
  classArmId: "arm1",
  termId: TERM_ID,
  sessionId: SESSION_ID,
  subjects: [
    {
      subjectId: "sub1",
      subjectName: "Mathematics",
      needsTeacherAssignment: false,
      components: [],
      totalScore: 78,
      autoGrade: "B2",
      overrideGrade: null,
      finalGrade: "B2",
      subjectPosition: 3,
      status: "PUBLISHED",
    },
  ],
  overall: null,
  remarks: {
    teacherRemark: null,
    teacherRemarkBy: null,
    teacherRemarkAt: null,
    principalRemark: null,
    principalRemarkBy: null,
    principalRemarkAt: null,
  },
};

function mockStudentApi() {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
    if (path.includes("/me/profile")) return { studentId: "st1", firstName: "Chidi", lastName: "Okafor", currentClassArmLabel: "JSS 1 A" };
    if (path.includes("/me/terms")) {
      return { sessions: [{ id: SESSION_ID, name: "2026/2027", isCurrent: true, terms: [{ id: TERM_ID, name: "FIRST", isCurrent: true, closedAt: null }] }] };
    }
    if (path.includes("/me/report-card")) return REPORT_CARD;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("PortalHome", () => {
  it("STUDENT: shows their own published subject via the shared report-card renderer, with a term picker defaulting to current", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockStudentApi();

    renderWithProviders(<PortalHome />);

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Chidi Okafor")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Term" })).toHaveValue(TERM_ID);
    // Read-only for a STUDENT — no remark write forms.
    expect(screen.queryByRole("textbox", { name: "Teacher remark" })).not.toBeInTheDocument();
  });

  it("PARENT: shows a linked child's own published subject via the same shared renderer, through the child-switcher", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "PARENT" };
      if (path.includes("/me/children/child-1/terms")) {
        return { sessions: [{ id: SESSION_ID, name: "2026/2027", isCurrent: true, terms: [{ id: TERM_ID, name: "FIRST", isCurrent: true, closedAt: null }] }] };
      }
      if (path.includes("/me/children/child-1/report-card")) return { ...REPORT_CARD, studentId: "child-1" };
      if (path.includes("/me/children")) {
        return { children: [{ studentId: "child-1", firstName: "Kemi", lastName: "Okafor", currentClassArmLabel: "JSS 1 A" }] };
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<PortalHome />);

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Child" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Term" })).toHaveValue(TERM_ID);
    // Read-only for a PARENT too — no remark write forms.
    expect(screen.queryByRole("textbox", { name: "Teacher remark" })).not.toBeInTheDocument();
  });

  // v0.6 step 6 polish: an empty Term picker (nothing to pick) is hidden
  // entirely rather than showing an unusable "Select…"-only dropdown above
  // the empty-state message — matches how the PARENT child-picker row
  // already only renders when there's at least one child.
  it("STUDENT with no terms yet: shows the empty state and hides the (unusable) Term picker", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/profile")) return { studentId: "st1", firstName: "Chidi", lastName: "Okafor", currentClassArmLabel: null };
      if (path.includes("/me/terms")) return { sessions: [] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<PortalHome />);

    expect(await screen.findByText(/No terms yet/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Term" })).not.toBeInTheDocument();
  });
});
