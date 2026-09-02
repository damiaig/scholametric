import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { MyGradesPage } from "./MyGradesPage";

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
      evaluations: [],
      totalScore: 78,
      autoGrade: "B2",
      overrideGrade: null,
      finalGrade: "B2",
      subjectPosition: 3,
      status: "PUBLISHED",
      classAverageScore: null,
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

// SPEC_V0.7.1.md §3 (item 20) — MyGradesPage is PortalHome's exact former
// content, relocated to /me/grades; these tests port PortalHome.test.tsx's
// coverage unchanged, plus the new childId-in-the-URL behavior for PARENT.
describe("MyGradesPage", () => {
  it("STUDENT: shows their own published subject via the shared report-card renderer, with a term picker defaulting to current", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockStudentApi();

    renderWithProviders(<MyGradesPage />);

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Chidi Okafor")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Term" })).toHaveValue(TERM_ID);
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

    renderWithProviders(<MyGradesPage />);

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Child" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Term" })).toHaveValue(TERM_ID);
    expect(screen.queryByRole("textbox", { name: "Teacher remark" })).not.toBeInTheDocument();
  });

  it("PARENT: a childId already in the URL (e.g. from the dashboard's 'View all →') is honored directly, no default-child flicker", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "PARENT" };
      if (path.includes("/me/children/child-2/terms")) {
        return { sessions: [{ id: SESSION_ID, name: "2026/2027", isCurrent: true, terms: [{ id: TERM_ID, name: "FIRST", isCurrent: true, closedAt: null }] }] };
      }
      if (path.includes("/me/children/child-2/report-card")) return { ...REPORT_CARD, studentId: "child-2" };
      if (path.includes("/me/children")) {
        return {
          children: [
            { studentId: "child-1", firstName: "Kemi", lastName: "Okafor", currentClassArmLabel: "JSS 1 A" },
            { studentId: "child-2", firstName: "Tunde", lastName: "Okafor", currentClassArmLabel: "JSS 2 A" },
          ],
        };
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyGradesPage />, { route: "/me/grades?childId=child-2" });

    await screen.findByText("Mathematics");
    expect(screen.getByRole("combobox", { name: "Child" })).toHaveValue("child-2");
  });

  it("PARENT: an invalid/unknown childId in the URL falls back to the parent's first linked child", async () => {
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

    renderWithProviders(<MyGradesPage />, { route: "/me/grades?childId=not-mine" });

    await screen.findByText("Mathematics");
    expect(screen.getByRole("combobox", { name: "Child" })).toHaveValue("child-1");
  });

  it("STUDENT with no terms yet: shows the empty state and hides the (unusable) Term picker", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/profile")) return { studentId: "st1", firstName: "Chidi", lastName: "Okafor", currentClassArmLabel: null };
      if (path.includes("/me/terms")) return { sessions: [] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyGradesPage />);

    expect(await screen.findByText(/No terms yet/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Term" })).not.toBeInTheDocument();
  });
});
