import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { StudentDashboard } from "./StudentDashboard";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const USER = {
  id: "u1",
  email: null,
  firstName: "Chidi",
  lastName: "Okafor",
  status: "ACTIVE",
  lastLoginAt: null,
  mustChangePassword: false,
  role: "STUDENT",
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

const TERM_ID = "term-1";
const SESSION_ID = "session-1";
const TERMS = { sessions: [{ id: SESSION_ID, name: "2026/2027", isCurrent: true, terms: [{ id: TERM_ID, name: "FIRST", isCurrent: true, closedAt: null }] }] };

// Deliberately includes a SECOND subject ("History") that is DRAFT/invisible
// — never published, so getReportCard's own where-clause never returns it
// at all. The straggler classmate's name/id belt-and-suspenders check below
// asserts this app-level: the dashboard must show nothing about it, exactly
// like the v0.7 report-card wall itself already proves server-side.
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
      evaluations: [
        { evaluationId: "e1", name: "CA 1", description: "First test", rawScore: 60, isAbsent: false, classAverageScore: 55, bestScore: 90, worstScore: 20 },
        { evaluationId: "e2", name: "CA 2", description: "Second test", rawScore: 70, isAbsent: false, classAverageScore: 65, bestScore: 100, worstScore: 30 },
      ],
      totalScore: 65,
      autoGrade: "B3",
      overrideGrade: null,
      finalGrade: "B3",
      subjectPosition: 2,
      status: "PUBLISHED",
      classAverageScore: 60,
    },
  ],
  overall: { averageScore: 65, averageGrade: "B3", overallPosition: 2, status: "PUBLISHED", subjectsCount: 1, generalClassAverage: 58 },
  remarks: { teacherRemark: null, teacherRemarkBy: null, teacherRemarkAt: null, principalRemark: null, principalRemarkBy: null, principalRemarkAt: null },
};

const YEAR_EXAMS = {
  studentId: "st1",
  sessionId: SESSION_ID,
  terms: [
    {
      termId: TERM_ID,
      termName: "FIRST",
      subjects: [
        {
          subjectId: "sub1",
          subjectName: "Mathematics",
          exams: [{ examId: "ex1", name: "Term 1 Exam", rawScore: 80, isAbsent: false, classAverageScore: 70, bestScore: 95, worstScore: 40 }],
          subjectExamAverage: 80,
          subjectExamGrade: "B2",
          classAverageScore: 70,
        },
      ],
      termExamAverage: 80,
      termExamGrade: "B2",
      termExamPosition: 1,
      status: "PUBLISHED",
      classAverageScore: 70,
    },
  ],
  overallExamAverage: 80,
  overallExamGrade: "B2",
  yearExamPosition: 1,
  termsCount: 1,
  overallStatus: "PUBLISHED",
  generalClassAverage: 70,
};

function mockApi() {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return USER;
    if (path.includes("/me/profile")) return { studentId: "st1", firstName: "Chidi", lastName: "Okafor", currentClassArmLabel: "JSS 1 A" };
    if (path.includes("/me/terms")) return TERMS;
    if (path.includes("/me/report-card")) return REPORT_CARD;
    if (path.includes("/me/year-exams")) return YEAR_EXAMS;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("StudentDashboard", () => {
  it("renders the three metric cards straight from overall (average, class average, position)", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi();

    renderWithProviders(<StudentDashboard />);

    expect(await screen.findByText("65")).toBeInTheDocument();
    expect(screen.getByText("Your average /100")).toBeInTheDocument();
    expect(screen.getByText("Class average /100")).toBeInTheDocument();
    expect(screen.getByText("58")).toBeInTheDocument();
    expect(screen.getByText("Position")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("a null overall (nothing published yet) shows dashes, not a crash or a fake 0", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return USER;
      if (path.includes("/me/profile")) return { studentId: "st1", firstName: "Chidi", lastName: "Okafor", currentClassArmLabel: "JSS 1 A" };
      if (path.includes("/me/terms")) return TERMS;
      if (path.includes("/me/report-card")) return { ...REPORT_CARD, subjects: [], overall: null };
      if (path.includes("/me/year-exams")) return { ...YEAR_EXAMS, terms: [] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<StudentDashboard />);

    expect(await screen.findByText("Your average /100")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("Not yet ranked")).toBeInTheDocument();
  });

  it("'Your grades' shows the most recent evaluation and exam per subject, with class average, and links to /me/grades", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi();

    renderWithProviders(<StudentDashboard />);

    // CA2 is the LAST evaluation for Mathematics (most recent per subject) — CA1 must not appear.
    expect(await screen.findByText("CA 2")).toBeInTheDocument();
    expect(screen.queryByText("CA 1")).not.toBeInTheDocument();
    expect(screen.getByText("Term 1 Exam")).toBeInTheDocument();
    expect(screen.getByText("Mathematics · Evaluation")).toBeInTheDocument();
    expect(screen.getByText("Mathematics · Exam")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View all →" })[0]).toHaveAttribute("href", "/me/grades");
  });

  it("Grades and Homework link cards render, Homework labeled 'Coming soon' with no fetch", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi();

    renderWithProviders(<StudentDashboard />);

    await screen.findByText("Your grades");
    expect(screen.getByRole("link", { name: /Grades/ })).toHaveAttribute("href", "/me/grades");
    expect(screen.getByText("Homework")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  // v0.7's anonymity rule (SPEC_V0.7.md §4), belt-and-suspenders, on the
  // NEW surface. The real ReportCardEvaluation/StudentExamRow types have
  // no classmate-name field at all — the backend is already proven (v0.7
  // step 5 e2e) to never send one. What this test guards against is a
  // FRONTEND regression: an evaluation/exam object carrying an unexpected
  // extra field (simulating "what if a future payload ever included one")
  // must NOT surface in the rendered DOM — proving GradesBySubjectCard and
  // the stat cards read known fields explicitly (rawScore/classAverage
  // Score/bestScore/worstScore) rather than spreading/dumping whatever
  // the object happens to contain.
  it("an unexpected extra field on an evaluation/exam row (simulating a hypothetical name leak) never reaches the rendered DOM", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const hostileReportCard = {
      ...REPORT_CARD,
      subjects: [
        {
          ...REPORT_CARD.subjects[0],
          evaluations: REPORT_CARD.subjects[0].evaluations.map((e) => ({ ...e, bestStudentName: "Classmate Leak" })),
        },
      ],
    };
    const hostileYearExams = {
      ...YEAR_EXAMS,
      terms: [
        {
          ...YEAR_EXAMS.terms[0],
          subjects: [
            {
              ...YEAR_EXAMS.terms[0].subjects[0],
              exams: YEAR_EXAMS.terms[0].subjects[0].exams.map((e) => ({ ...e, worstStudentName: "Straggler Leak" })),
            },
          ],
        },
      ],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return USER;
      if (path.includes("/me/profile")) return { studentId: "st1", firstName: "Chidi", lastName: "Okafor", currentClassArmLabel: "JSS 1 A" };
      if (path.includes("/me/terms")) return TERMS;
      if (path.includes("/me/report-card")) return hostileReportCard;
      if (path.includes("/me/year-exams")) return hostileYearExams;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const { container } = renderWithProviders(<StudentDashboard />);
    // Wait for the actual data-bearing rows to render, not just the
    // (always-present) "Your grades" heading — otherwise this assertion
    // could pass merely because the leak hasn't rendered YET, not because
    // it never renders.
    await screen.findByText("CA 2");
    await screen.findByText("Term 1 Exam");

    expect(container.innerHTML).not.toContain("Classmate Leak");
    expect(container.innerHTML).not.toContain("Straggler Leak");
  });
});
