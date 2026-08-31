import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ClassArmDetail, EvaluationsListResponse, MyTeaching, Paginated, Term, AcademicSession } from "@scholametric/shared";
import { renderWithProviders, createTestQueryClient } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest, ApiError } from "../../lib/api-client";
import { ScoreEntryGridPage } from "./ScoreEntryGridPage";
import { AppRoutes } from "../../App";

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

const EMPTY_TEACHING: MyTeaching = { classTeacherOf: [], subjects: [], currentSessionId: null, currentTermId: null, currentTermName: null };

const EVALUATIONS_RESPONSE: EvaluationsListResponse = {
  classArmId: "arm1",
  subjectId: "sub1",
  termId: "term1",
  termClosed: false,
  locked: false,
  unlockReason: null,
  evaluations: [
    { id: "c1", name: "CA 1", description: "CA 1", createdAt: "t", createdBy: "u1" },
    { id: "c2", name: "Exam", description: "Exam", createdAt: "t", createdBy: "u1" },
  ],
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

// Mathematics is assigned for arm1 this session; the "params-rejected" tests
// below target a DIFFERENT subject (sub2) that never appears here — arm-level
// access is fine (armDetail succeeds), but that specific subject has no
// assignment, which is exactly the case assertTeacherAssignment (v0.5.1 step
// 1) rejects on GET /grades/evaluations.
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

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

// SPEC_V0.5.1.md §2.3, v0.5.1 step 3 — Flag 1: a bare hit on /grades/grid (no
// classArmId/subjectId) has no legitimate starting point, so it redirects
// rather than rendering a free-roam picker. Exercises the REAL route tree
// (App.tsx's <AppRoutes>), same approach as ChangePasswordFlow.test.tsx,
// because the redirect target depends on real sibling routes.
describe("ScoreEntryGridPage — bare-route redirect (no free-roam entry point)", () => {
  function renderApp(route: string) {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("TEACHER: redirects to /dashboard (MyClassesView — their real Enter-grades source), never a roaming picker", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/me") return TEACHER_USER;
      if (path === "/api/v1/me/teaching") return TEACHING;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderApp("/grades/grid");

    expect(await screen.findByText("Classes I teach")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Enter grades" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Class")).not.toBeInTheDocument();
  });

  it("SCHOOL_ADMIN/PROPRIETOR: redirects to /classes (class-arm-detail is where their Enter-grades action lives)", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/classes") return [];
      if (path === "/api/v1/subjects") return { items: [], total: 0, page: 1, pageSize: 100 };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderApp("/grades/grid");

    expect(await screen.findByRole("tab", { name: "Classes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Enter grades" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Class")).not.toBeInTheDocument();
  });
});

function mockGridPage(role: "SCHOOL_ADMIN" | "TEACHER") {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path === "/api/v1/auth/me") return role === "SCHOOL_ADMIN" ? ADMIN_USER : TEACHER_USER;
    if (path === "/api/v1/me/teaching") return TEACHING;
    if (path === "/api/v1/class-arms/arm1") return ARM1_DETAIL;
    if (path === "/api/v1/grades/evaluations") return EVALUATIONS_RESPONSE;
    if (path === "/api/v1/sessions") return SESSIONS;
    if (path === "/api/v1/terms") return TERMS;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

describe("ScoreEntryGridPage — class+subject locked as read-only labels (SPEC_V0.5.1.md §2.3)", () => {
  it("SCHOOL_ADMIN: renders 'JSS 1 A · Mathematics' as plain text, with no Class or Subject picker anywhere — Term and Evaluation stay real, interactive selects", async () => {
    mockGridPage("SCHOOL_ADMIN");
    renderWithProviders(<ScoreEntryGridPage />, { route: "/grades/grid?classArmId=arm1&subjectId=sub1" });

    expect(await screen.findByText("JSS 1 A · Mathematics")).toBeInTheDocument();

    // No roaming class/subject picker anywhere — neither a labelled select
    // nor any select at all beyond Term/Evaluation.
    expect(screen.queryByLabelText("Class")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Subject")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Class & subject")).not.toBeInTheDocument();

    const termSelect = screen.getByLabelText("Term") as HTMLSelectElement;
    expect(termSelect.tagName).toBe("SELECT");
    await waitFor(() => expect(termSelect).not.toBeDisabled());

    const evaluationSelect = (await screen.findByLabelText("Evaluation")) as HTMLSelectElement;
    expect(evaluationSelect.tagName).toBe("SELECT");
    await waitFor(() => expect(evaluationSelect).not.toBeDisabled());

    expect(screen.getAllByRole("combobox")).toHaveLength(2); // Term + Evaluation only
  });

  it("TEACHER: renders the same locked label; Term is fixed text (unchanged), Evaluation is still a real select", async () => {
    mockGridPage("TEACHER");
    renderWithProviders(<ScoreEntryGridPage />, { route: "/grades/grid?classArmId=arm1&subjectId=sub1" });

    expect(await screen.findByText("JSS 1 A · Mathematics")).toBeInTheDocument();
    expect(screen.queryByLabelText("Class")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Subject")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Class & subject")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Term")).not.toBeInTheDocument();
    expect(screen.getByText("First term")).toBeInTheDocument();

    expect(await screen.findByLabelText("Evaluation")).toBeInTheDocument();
  });

  it("picking an evaluation (term already resolved to current) loads the grid for the locked class+subject", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, unknown> }) => {
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/class-arms/arm1") return ARM1_DETAIL;
      if (path === "/api/v1/grades/evaluations") return EVALUATIONS_RESPONSE;
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/grades/evaluation-scores") {
        expect(opts?.query).toMatchObject({ classArmId: "arm1", subjectId: "sub1" });
        return { classArmId: "arm1", subjectId: "sub1", evaluationId: "c1", termId: "term1", termClosed: false, locked: false, unlockReason: null, rows: [] };
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<ScoreEntryGridPage />, { route: "/grades/grid?classArmId=arm1&subjectId=sub1" });

    await screen.findByText("JSS 1 A · Mathematics");
    const evaluationSelect = await screen.findByLabelText("Evaluation");
    await waitFor(() => expect(evaluationSelect).not.toBeDisabled());
    await user.selectOptions(evaluationSelect, "c1");

    expect(await screen.findByText("No students enrolled in this class.")).toBeInTheDocument();
  });
});

describe("ScoreEntryGridPage — params-rejected: the backend gate (assertTeacherAssignment), not the frontend, is the real boundary", () => {
  it("SCHOOL_ADMIN: an unassigned subject 404s cleanly through the evaluation picker, not a broken/blank state", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/class-arms/arm1") return ARM1_DETAIL; // arm-level access is fine
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/grades/evaluations") {
        throw new ApiError(404, {
          statusCode: 404,
          message: "No teacher is assigned to teach this subject for this class.",
          error: "Not Found",
          path: "/api/v1/grades/evaluations",
          timestamp: new Date().toISOString(),
        });
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    // sub2 is deliberately absent from ARM1_DETAIL.subjectTeachers — the
    // label falls back to "Subject" (arm-level access succeeded, but this
    // specific subject was never assigned), same as a hand-edited URL would.
    renderWithProviders(<ScoreEntryGridPage />, { route: "/grades/grid?classArmId=arm1&subjectId=sub2" });

    await screen.findByText("JSS 1 A · Subject");
    expect(await screen.findByText("No teacher is assigned to teach this subject for this class.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("TEACHER: a subject they don't personally teach 403s cleanly through the evaluation picker", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/me") return TEACHER_USER;
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/class-arms/arm1") return ARM1_DETAIL;
      if (path === "/api/v1/grades/evaluations") {
        throw new ApiError(403, {
          statusCode: 403,
          message: "You are not assigned to teach this subject for this class.",
          error: "Forbidden",
          path: "/api/v1/grades/evaluations",
          timestamp: new Date().toISOString(),
        });
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<ScoreEntryGridPage />, { route: "/grades/grid?classArmId=arm1&subjectId=sub2" });

    await screen.findByText("JSS 1 A · Subject");
    expect(await screen.findByText("You are not assigned to teach this subject for this class.")).toBeInTheDocument();
  });
});

describe("ScoreEntryGridPage — armDetail itself rejecting (e.g. a stale link to a class no longer taught)", () => {
  it("TEACHER: 403 from GET /class-arms/:id replaces the whole picker+grid area with a clean error, not a crash", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/me") return TEACHER_USER;
      if (path === "/api/v1/me/teaching") return EMPTY_TEACHING;
      if (path === "/api/v1/class-arms/arm1") {
        throw new ApiError(403, {
          statusCode: 403,
          message: "You are not assigned to this class.",
          error: "Forbidden",
          path: "/api/v1/class-arms/arm1",
          timestamp: new Date().toISOString(),
        });
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<ScoreEntryGridPage />, { route: "/grades/grid?classArmId=arm1&subjectId=sub1" });

    expect(await screen.findByText("You are not assigned to this class.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Evaluation")).not.toBeInTheDocument();
  });
});
