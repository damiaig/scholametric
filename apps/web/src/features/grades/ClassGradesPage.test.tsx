import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type {
  ClassArmDetail,
  EvaluationsListResponse,
  ExamsListResponse,
  MyTeaching,
  Paginated,
  Term,
  AcademicSession,
  ClassArmResultsResponse,
} from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ClassGradesPage } from "./ClassGradesPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const TEACHER_USER = {
  id: "u2",
  email: "teacher@sunrise.test",
  firstName: "Bola",
  lastName: "Ogundare",
  role: "TEACHER",
  status: "ACTIVE",
  lastLoginAt: null,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

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

const TEACHING: MyTeaching = {
  classTeacherOf: [],
  subjects: [{ id: "sa1", subjectId: "sub1", subjectName: "Mathematics", classArmId: "arm1", className: "JSS 1 A" }],
  currentSessionId: "sess1",
  currentTermId: "term1",
  currentTermName: "FIRST",
};

const ARM1_DETAIL: ClassArmDetail = {
  id: "arm1",
  name: "A",
  classLevel: { id: "lvl1", name: "JSS 1", rank: 1 },
  classTeacher: null,
  subjectTeachers: [
    { id: "sta1", subjectId: "sub1", subjectName: "Mathematics", teacherUserId: "t1", teacherFirstName: "Bola", teacherLastName: "Ogundare" },
  ],
  students: { items: [], total: 0, page: 1, pageSize: 1 },
};

const EVALUATIONS_OPEN: EvaluationsListResponse = {
  classArmId: "arm1",
  subjectId: "sub1",
  termId: "term1",
  termClosed: false,
  locked: false,
  unlockReason: null,
  evaluations: [{ id: "c1", name: "CA 1", description: "First continuous assessment", createdAt: "t", createdBy: "u1" }],
};

const EVALUATIONS_CLOSED_LOCKED: EvaluationsListResponse = { ...EVALUATIONS_OPEN, termClosed: true, locked: true, unlockReason: null };

const EXAMS_OPEN: ExamsListResponse = {
  classArmId: "arm1",
  subjectId: "sub1",
  termId: "term1",
  termClosed: false,
  locked: false,
  unlockReason: null,
  exams: [{ id: "e1", name: "Term 1 Exam", createdAt: "t", createdBy: "u1" }],
};

const SESSIONS: Paginated<AcademicSession> = {
  items: [{ id: "sess1", schoolId: "s1", name: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-07-31", isCurrent: true, createdAt: "t", updatedAt: "t" }],
  total: 1,
  page: 1,
  pageSize: 50,
};
const TERMS: Paginated<Term> = {
  items: [{ id: "term1", schoolId: "s1", sessionId: "sess1", name: "FIRST", startsOn: "2026-09-01", endsOn: "2026-12-15", isCurrent: true, closedAt: null, closedBy: null, createdAt: "t", updatedAt: "t" }],
  total: 1,
  page: 1,
  pageSize: 20,
};

const RESULTS: ClassArmResultsResponse = {
  classArmId: "arm1",
  termId: "term1",
  students: [{ studentId: "s1", firstName: "Ada", lastName: "Bello", admissionNumber: "SUN/0001" }],
  subjects: [
    {
      subjectId: "sub1",
      subjectName: "Mathematics",
      needsTeacherAssignment: false,
      averageScore: 56,
      averageGrade: "C5",
      results: [{ id: "tsr1", studentId: "s1", totalScore: 56, autoGrade: "C5", overrideGrade: null, finalGrade: "C5", subjectPosition: null, status: "PENDING_APPROVAL" }],
    },
  ],
  overall: null,
};

function mockCommon(role: "SCHOOL_ADMIN" | "TEACHER", evaluations = EVALUATIONS_OPEN) {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path === "/api/v1/auth/me") return role === "SCHOOL_ADMIN" ? ADMIN_USER : TEACHER_USER;
    if (path === "/api/v1/me/teaching") return TEACHING;
    if (path === "/api/v1/class-arms/arm1") return ARM1_DETAIL;
    if (path === "/api/v1/grades/evaluations") return evaluations;
    if (path === "/api/v1/exams") return EXAMS_OPEN;
    if (path === "/api/v1/sessions") return SESSIONS;
    if (path === "/api/v1/terms") return TERMS;
    if (path === "/api/v1/class-arms/arm1/results") return RESULTS;
    throw new Error(`unexpected apiRequest call: ${path}`);
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

function renderPage(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/classes/arms/:id/grades" element={<ClassGradesPage />} />
    </Routes>,
    { route },
  );
}

describe("ClassGradesPage — Enter scores tab", () => {
  it("SCHOOL_ADMIN: shows the locked class+subject context, the evaluation list (not a dropdown), and loads the grid on selection", async () => {
    mockCommon("SCHOOL_ADMIN");
    renderPage("/classes/arms/arm1/grades?tab=enter&subjectId=sub1&track=evaluations");

    expect(await screen.findByText("JSS 1 A · Mathematics")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Enter scores" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Evaluations" })).toHaveAttribute("aria-selected", "true");

    const evaluationButton = await screen.findByRole("button", { name: /CA 1/ });
    expect(screen.getByText("First continuous assessment")).toBeInTheDocument();

    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, unknown> }) => {
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/class-arms/arm1") return ARM1_DETAIL;
      if (path === "/api/v1/grades/evaluations") return EVALUATIONS_OPEN;
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/grades/evaluation-scores") {
        expect(opts?.query).toMatchObject({ classArmId: "arm1", subjectId: "sub1" });
        return { classArmId: "arm1", subjectId: "sub1", evaluationId: "c1", termId: "term1", termClosed: false, locked: false, unlockReason: null, rows: [] };
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    await user.click(evaluationButton);

    expect(await screen.findByText("No students enrolled in this class.")).toBeInTheDocument();
  });

  it("TEACHER: term is fixed text (not a select), evaluation list still renders", async () => {
    mockCommon("TEACHER");
    renderPage("/classes/arms/arm1/grades?tab=enter&subjectId=sub1&track=evaluations");

    expect(await screen.findByText("JSS 1 A · Mathematics")).toBeInTheDocument();
    await screen.findByText("First term");
    expect(screen.queryByLabelText("Term")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /CA 1/ })).toBeInTheDocument();
  });

  it("switching the track tab to Exams shows the exam list instead of evaluations", async () => {
    mockCommon("SCHOOL_ADMIN");
    renderPage("/classes/arms/arm1/grades?tab=enter&subjectId=sub1&track=evaluations");

    await screen.findByRole("button", { name: /CA 1/ });
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Exams" }));

    expect(await screen.findByRole("button", { name: "Term 1 Exam" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CA 1/ })).not.toBeInTheDocument();
    // The publish/unpublish affordance is exams-only, admin-visible.
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
  });

  // v0.7.1 step 4 (SPEC_V0.7.1.md §4.3, item 11) — the grid header now
  // names WHICH evaluation/exam is being graded, not just the class+
  // subject context. Derived from the same already-fetched evaluations/
  // exams list the picker itself uses (no new fetch, see use-recently-
  // posted.ts's analogous pattern in the teacher dashboard).
  it("selecting an evaluation shows its name + class/subject context in the grid heading ('Now grading')", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, unknown> }) => {
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/class-arms/arm1") return ARM1_DETAIL;
      if (path === "/api/v1/grades/evaluations") return EVALUATIONS_OPEN;
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/grades/evaluation-scores") {
        expect(opts?.query).toMatchObject({ classArmId: "arm1", subjectId: "sub1" });
        return { classArmId: "arm1", subjectId: "sub1", evaluationId: "c1", termId: "term1", termClosed: false, locked: false, unlockReason: null, rows: [] };
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    renderPage("/classes/arms/arm1/grades?tab=enter&subjectId=sub1&track=evaluations");

    const evaluationButton = await screen.findByRole("button", { name: /CA 1/ });
    const user = userEvent.setup();
    await user.click(evaluationButton);

    expect(await screen.findByText("Now grading")).toBeInTheDocument();
    expect(screen.getByText(/JSS 1 A · Mathematics/, { selector: "span" })).toBeInTheDocument();
    expect(screen.getAllByText("CA 1").length).toBeGreaterThan(0);
  });

  it("selecting an exam shows its name + class/subject context in the grid heading", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, unknown> }) => {
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/class-arms/arm1") return ARM1_DETAIL;
      if (path === "/api/v1/grades/evaluations") return EVALUATIONS_OPEN;
      if (path === "/api/v1/exams") return EXAMS_OPEN;
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/exams/scores") {
        expect(opts?.query).toMatchObject({ classArmId: "arm1", subjectId: "sub1" });
        return { classArmId: "arm1", subjectId: "sub1", examId: "e1", termId: "term1", termClosed: false, locked: false, unlockReason: null, rows: [] };
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    renderPage("/classes/arms/arm1/grades?tab=enter&subjectId=sub1&track=exams");

    const examButton = await screen.findByRole("button", { name: "Term 1 Exam" });
    const user = userEvent.setup();
    await user.click(examButton);

    expect(await screen.findByText("Now grading")).toBeInTheDocument();
    expect(screen.getAllByText("Term 1 Exam").length).toBeGreaterThan(0);
  });

  it("no evaluations yet: shows the named empty state, not a bare/blank list", async () => {
    mockCommon("SCHOOL_ADMIN", { ...EVALUATIONS_OPEN, evaluations: [] });
    renderPage("/classes/arms/arm1/grades?tab=enter&subjectId=sub1&track=evaluations");

    expect(await screen.findByText("No evaluations yet — create one.")).toBeInTheDocument();
  });

  // Non-negotiable: the closed-term block must stay VISIBLE in the
  // restructured tab, not hidden by the navigation change.
  it("closed term, no active unlock: the blocked state (disabled New + reason banner) still renders inside the Enter-scores tab", async () => {
    mockCommon("SCHOOL_ADMIN", EVALUATIONS_CLOSED_LOCKED);
    renderPage("/classes/arms/arm1/grades?tab=enter&subjectId=sub1&track=evaluations");

    expect(await screen.findByText(/This term is closed for this class and subject/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeDisabled();
  });

  it("a subject not in this class arm falls back to the generic 'Subject' label, matching the old locked-context behavior", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/class-arms/arm1") return ARM1_DETAIL;
      if (path === "/api/v1/grades/evaluations") return { ...EVALUATIONS_OPEN, subjectId: "sub2" };
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    renderPage("/classes/arms/arm1/grades?tab=enter&subjectId=sub2&track=evaluations");

    expect(await screen.findByText("JSS 1 A · Subject")).toBeInTheDocument();
  });
});

describe("ClassGradesPage — Results tab", () => {
  it("no subjectId in the URL falls back to Results — no class picker, just this class's whole-class results", async () => {
    mockCommon("SCHOOL_ADMIN");
    renderPage("/classes/arms/arm1/grades");

    expect(await screen.findByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByLabelText("Class")).not.toBeInTheDocument();
    await screen.findAllByText("Mathematics");
    expect(screen.getAllByText("C5").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Not yet ranked/).length).toBeGreaterThan(0);
  });

  it("tab=enter with no subjectId (e.g. a hand-edited URL) names the next step instead of a blank grid", async () => {
    mockCommon("SCHOOL_ADMIN");
    renderPage("/classes/arms/arm1/grades?tab=enter");

    expect(await screen.findByRole("tab", { name: "Enter scores" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Pick a subject from this class's subject-teacher list to enter scores.")).toBeInTheDocument();
  });

  it("TEACHER: Results tab shows the fixed current term, no term dropdown", async () => {
    mockCommon("TEACHER");
    renderPage("/classes/arms/arm1/grades?tab=results");

    await screen.findAllByText("Mathematics");
    expect(screen.queryByLabelText("Term")).not.toBeInTheDocument();
    expect(screen.getByText("First term")).toBeInTheDocument();
  });

  it("switching from Results back to Enter scores via the tab bar re-shows the subject context", async () => {
    mockCommon("SCHOOL_ADMIN");
    renderPage("/classes/arms/arm1/grades?tab=enter&subjectId=sub1&track=evaluations");

    await screen.findByRole("button", { name: /CA 1/ });
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Results" }));

    await waitFor(() => expect(screen.queryByText("JSS 1 A · Mathematics")).not.toBeInTheDocument());
    await screen.findAllByText("Mathematics");

    await user.click(screen.getByRole("tab", { name: "Enter scores" }));
    expect(await screen.findByText("JSS 1 A · Mathematics")).toBeInTheDocument();
  });
});

describe("ClassGradesPage — class-arm load failure", () => {
  it("shows the backend's error message, not a crash, for either tab", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/class-arms/arm1") {
        const { ApiError } = await import("../../lib/api-client");
        throw new ApiError(404, { statusCode: 404, message: "Class arm not found.", error: "Not Found", path: "/api/v1/class-arms/arm1", timestamp: new Date().toISOString() });
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderPage("/classes/arms/arm1/grades");
    expect(await screen.findByText("Class arm not found.")).toBeInTheDocument();
  });
});
