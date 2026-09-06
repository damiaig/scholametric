import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { ReportCardResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { StudentReportCardView } from "./StudentReportCardView";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const CURRENT_USER = {
  id: "st1",
  email: null,
  firstName: "Chidi",
  lastName: "Okafor",
  role: "STUDENT",
  status: "ACTIVE",
  lastLoginAt: null,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

const CARD: ReportCardResponse = {
  studentId: "st1",
  firstName: "Chidi",
  lastName: "Okafor",
  admissionNumber: "SUN/2026/0099",
  classArmId: "arm1",
  termId: "term1",
  sessionId: "session1",
  subjects: [
    {
      subjectId: "sub1",
      subjectName: "Mathematics",
      needsTeacherAssignment: false,
      evaluations: [
        { evaluationId: "e1", name: "CA 1", description: "First test", rawScore: 72, isAbsent: false, classAverageScore: 65, bestScore: 90, worstScore: 20 },
        { evaluationId: "e2", name: "CA 2", description: "", rawScore: null, isAbsent: true, classAverageScore: null, bestScore: null, worstScore: null },
      ],
      totalScore: 60,
      autoGrade: "B3",
      overrideGrade: null,
      finalGrade: "B3",
      subjectPosition: 3,
      status: "PUBLISHED",
      classAverageScore: 58,
    },
  ],
  overall: null,
  runningAverageScore: 55,
  remarks: {
    teacherRemark: null,
    teacherRemarkBy: null,
    teacherRemarkAt: null,
    principalRemark: null,
    principalRemarkBy: null,
    principalRemarkAt: null,
  },
};

function mockApi() {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return CURRENT_USER;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

// v0.7.2 step 3 (SPEC_V0.7.2.md §4) — the designed student/parent Grades
// page. This renders the SAME ReportCardResponse the staff/print view
// (ReportCardDocument/ReportCardPage) renders — these tests confirm the
// restyle preserves every server-enforced guarantee (published-only,
// anonymous class stats, the Abs/—/score three-way, position staying
// provisional) while adding the running-average summary strip.
describe("StudentReportCardView", () => {
  it("shows the running average and per-subject details, with position staying 'Not yet ranked' while overall is still provisional", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi();

    renderWithProviders(<StudentReportCardView data={CARD} examsViewer={{ kind: "self" }} />);

    expect(screen.getByText("Your average so far")).toBeInTheDocument();
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.getByText("Not yet ranked")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("B3")).toBeInTheDocument();
    expect(screen.getByText("Class avg 58")).toBeInTheDocument();
  });

  it("evaluation rows show the Abs/—/score three-way and anonymous class avg/best/worst, never a classmate name", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi();

    renderWithProviders(<StudentReportCardView data={CARD} examsViewer={{ kind: "self" }} />);

    expect(screen.getByText("CA 1")).toBeInTheDocument();
    expect(screen.getByText("First test")).toBeInTheDocument();
    expect(screen.getByText("Class avg 65 · Best 90 · Worst 20")).toBeInTheDocument();
    expect(screen.getByText("Abs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show exams" })).toBeInTheDocument();
  });

  it("once fully published, position resolves from overall (not the running average)", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi();
    const fullyPublished: ReportCardResponse = {
      ...CARD,
      overall: { averageScore: 60, averageGrade: "B3", overallPosition: 2, status: "PUBLISHED", subjectsCount: 1, generalClassAverage: 58 },
    };

    renderWithProviders(<StudentReportCardView data={fullyPublished} examsViewer={{ kind: "self" }} />);

    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.queryByText("Not yet ranked")).not.toBeInTheDocument();
  });

  it("zero published subjects: shows the honest 'not yet published' empty state, not a raw 'no results entered' printout message", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi();
    const empty: ReportCardResponse = { ...CARD, subjects: [], overall: null, runningAverageScore: null };

    renderWithProviders(<StudentReportCardView data={empty} examsViewer={{ kind: "self" }} />);

    expect(
      screen.getByText("Not yet published — results appear here once your teacher publishes them."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Your average so far")).not.toBeInTheDocument();
  });

  it("remarks always render read-only here, never a write form", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi();
    const withRemark: ReportCardResponse = {
      ...CARD,
      remarks: {
        teacherRemark: "Keep up the good work.",
        teacherRemarkBy: { firstName: "Bola", lastName: "Ogundare" },
        teacherRemarkAt: "2026-04-01T00:00:00.000Z",
        principalRemark: null,
        principalRemarkBy: null,
        principalRemarkAt: null,
      },
    };

    renderWithProviders(<StudentReportCardView data={withRemark} examsViewer={{ kind: "self" }} />);

    expect(screen.getByText("Teacher remark")).toBeInTheDocument();
    expect(screen.getByText("Keep up the good work.")).toBeInTheDocument();
    expect(screen.getByText("Principal remark")).toBeInTheDocument();
    expect(screen.getByText("No remark yet.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Teacher remark" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Principal remark" })).not.toBeInTheDocument();
  });

  it("needsTeacherAssignment renders its warning badge alongside the Published badge", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi();
    const needsAssignment: ReportCardResponse = {
      ...CARD,
      subjects: [{ ...CARD.subjects[0], needsTeacherAssignment: true }],
    };

    renderWithProviders(<StudentReportCardView data={needsAssignment} examsViewer={{ kind: "self" }} />);

    expect(screen.getByText("Needs a teacher assigned")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });
});
