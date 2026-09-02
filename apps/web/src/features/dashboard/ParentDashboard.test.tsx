import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ParentDashboard } from "./ParentDashboard";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const USER = {
  id: "u1",
  email: null,
  firstName: "Ngozi",
  lastName: "Okafor",
  status: "ACTIVE",
  lastLoginAt: null,
  mustChangePassword: false,
  role: "PARENT",
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

const TERM_ID = "term-1";
const SESSION_ID = "session-1";
const TERMS = { sessions: [{ id: SESSION_ID, name: "2026/2027", isCurrent: true, terms: [{ id: TERM_ID, name: "FIRST", isCurrent: true, closedAt: null }] }] };

const CHILDREN = {
  children: [
    { studentId: "child-1", firstName: "Kemi", lastName: "Okafor", currentClassArmLabel: "JSS 1 A" },
    { studentId: "child-2", firstName: "Tunde", lastName: "Okafor", currentClassArmLabel: "JSS 2 A" },
  ],
};

function reportCardFor(studentId: string, averageScore: number) {
  return {
    studentId,
    firstName: "Kemi",
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
        evaluations: [
          { evaluationId: "e1", name: "CA 1", description: "First test", rawScore: 72, isAbsent: false, classAverageScore: 55, bestScore: 90, worstScore: 20 },
        ],
        totalScore: 72,
        autoGrade: "B3",
        overrideGrade: null,
        finalGrade: "B3",
        subjectPosition: 1,
        status: "PUBLISHED",
        classAverageScore: 55,
      },
    ],
    overall: { averageScore, averageGrade: "B3", overallPosition: 1, status: "PUBLISHED", subjectsCount: 1, generalClassAverage: 50 },
    remarks: { teacherRemark: null, teacherRemarkBy: null, teacherRemarkAt: null, principalRemark: null, principalRemarkBy: null, principalRemarkAt: null },
  };
}

const YEAR_EXAMS = {
  studentId: "child-1",
  sessionId: SESSION_ID,
  terms: [
    {
      termId: TERM_ID,
      termName: "FIRST",
      subjects: [],
      termExamAverage: null,
      termExamGrade: null,
      termExamPosition: null,
      status: null,
      classAverageScore: null,
    },
  ],
  overallExamAverage: null,
  overallExamGrade: null,
  yearExamPosition: null,
  termsCount: 0,
  overallStatus: null,
  generalClassAverage: null,
};

function mockApi() {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return USER;
    if (path.includes("/me/children/child-1/terms")) return TERMS;
    if (path.includes("/me/children/child-2/terms")) return TERMS;
    if (path.includes("/me/children/child-1/report-card")) return reportCardFor("child-1", 60);
    if (path.includes("/me/children/child-2/report-card")) return reportCardFor("child-2", 90);
    if (path.includes("/me/children/child-1/year-exams")) return YEAR_EXAMS;
    if (path.includes("/me/children/child-2/year-exams")) return { ...YEAR_EXAMS, studentId: "child-2" };
    if (path.includes("/me/children")) return CHILDREN;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("ParentDashboard", () => {
  it("defaults to the first linked child and shows their metric cards + grades card", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi();

    renderWithProviders(<ParentDashboard />);

    expect(await screen.findByText("Kemi Okafor")).toBeInTheDocument();
    expect(screen.getByText("Tunde Okafor")).toBeInTheDocument();
    expect(await screen.findByText("60")).toBeInTheDocument(); // Kemi's average
    expect(screen.getByText("CA 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all →" })).toHaveAttribute("href", "/me/grades?childId=child-1");
  });

  it("switching child via the switcher swaps every figure to the new child's data", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi();
    const user = userEvent.setup();

    renderWithProviders(<ParentDashboard />);
    await screen.findByText("60"); // Kemi loaded first

    await user.click(screen.getByRole("button", { name: /Tunde Okafor/ }));

    expect(await screen.findByText("90")).toBeInTheDocument(); // Tunde's average
    expect(screen.queryByText("60")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all →" })).toHaveAttribute("href", "/me/grades?childId=child-2");
  });

  it("no linked children shows the empty state, not a crash", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return USER;
      if (path.includes("/me/children")) return { children: [] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<ParentDashboard />);

    expect(await screen.findByText("No children linked to your account yet.")).toBeInTheDocument();
  });
});
