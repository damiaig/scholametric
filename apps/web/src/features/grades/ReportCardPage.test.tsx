import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { ClassLevelOverview, Paginated, Term, AcademicSession, ReportCardResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ReportCardPage } from "./ReportCardPage";

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

const TEACHER_USER = { ...ADMIN_USER, id: "u2", email: "teacher@sunrise.test", role: "TEACHER" };

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
const CLASSES: ClassLevelOverview[] = [
  { id: "lvl1", name: "JSS 1", rank: 1, arms: [{ id: "arm1", name: "A", enrollmentCount: 20, classTeacher: null }] },
];

const CARD: ReportCardResponse = {
  studentId: "st1",
  firstName: "Oluwaseun",
  lastName: "Adeyemi",
  admissionNumber: "SUN/2026/0001",
  classArmId: "arm1",
  termId: "term1",
  sessionId: "sess1",
  subjects: [
    {
      subjectId: "sub1",
      subjectName: "Mathematics",
      needsTeacherAssignment: false,
      evaluations: [
        {
          evaluationId: "ca1",
          name: "CA 1",
          description: "Maths first continuous assessment",
          rawScore: 0,
          isAbsent: false,
          classAverageScore: 45,
          bestScore: 90,
          worstScore: 0,
        },
        {
          evaluationId: "ca2",
          name: "CA 2",
          description: "Maths second continuous assessment",
          rawScore: null,
          isAbsent: true,
          classAverageScore: null,
          bestScore: null,
          worstScore: null,
        },
        {
          evaluationId: "ca3",
          name: "CA 3",
          description: "Maths third continuous assessment",
          rawScore: null,
          isAbsent: false,
          classAverageScore: null,
          bestScore: null,
          worstScore: null,
        },
      ],
      totalScore: 0,
      autoGrade: "F9",
      overrideGrade: null,
      finalGrade: "F9",
      subjectPosition: 5,
      status: "DRAFT",
      classAverageScore: 42,
    },
    {
      subjectId: "sub2",
      subjectName: "English Language",
      needsTeacherAssignment: false,
      evaluations: [
        {
          evaluationId: "ca1",
          name: "CA 1",
          description: "First continuous assessment",
          rawScore: 18,
          isAbsent: false,
          classAverageScore: 20,
          bestScore: 25,
          worstScore: 15,
        },
        {
          evaluationId: "ca2",
          name: "CA 2",
          description: "Second continuous assessment",
          rawScore: 17,
          isAbsent: false,
          classAverageScore: 18,
          bestScore: 22,
          worstScore: 12,
        },
        {
          evaluationId: "ca3",
          name: "CA 3",
          description: "Third continuous assessment",
          rawScore: 55,
          isAbsent: false,
          classAverageScore: 50,
          bestScore: 60,
          worstScore: 40,
        },
      ],
      totalScore: 90,
      autoGrade: "A1",
      overrideGrade: null,
      finalGrade: "A1",
      subjectPosition: null,
      status: "PENDING_APPROVAL",
      classAverageScore: 68,
    },
  ],
  overall: null,
  remarks: {
    teacherRemark: null,
    teacherRemarkBy: null,
    teacherRemarkAt: null,
    principalRemark: "Keep up the effort next term.",
    principalRemarkBy: { firstName: "Adaobi", lastName: "Nwachukwu" },
    principalRemarkAt: "2026-12-15T09:00:00Z",
  },
};

function mockCommon(role: "SCHOOL_ADMIN" | "TEACHER", card: ReportCardResponse, extra: { classTeacherOf?: unknown[] } = {}) {
  mockedApiRequest.mockImplementation(async (path) => {
    if (path === "/api/v1/auth/me") return role === "SCHOOL_ADMIN" ? ADMIN_USER : TEACHER_USER;
    if (path === "/api/v1/classes") return CLASSES;
    if (path === "/api/v1/sessions") return SESSIONS;
    if (path === "/api/v1/terms") return TERMS;
    if (path === "/api/v1/me/teaching") {
      return {
        classTeacherOf: extra.classTeacherOf ?? [],
        subjects: [{ id: "e1", subjectId: "sub1", subjectName: "Mathematics", classArmId: "arm1", className: "JSS 1 A" }],
        currentSessionId: "sess1",
        currentTermId: "term1",
        currentTermName: "FIRST",
      };
    }
    if (path === "/api/v1/students/st1/report-card") return card;
    throw new Error(`unexpected call: ${path}`);
  });
}

function renderPage(route = "/students/st1/report-card?termId=term1&sessionId=sess1") {
  return renderWithProviders(
    <Routes>
      <Route path="/students/:id/report-card" element={<ReportCardPage />} />
    </Routes>,
    { route },
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

describe("ReportCardPage — rendering", () => {
  it("ADMIN: renders every subject's component breakdown, total/grade/position/status, and the school+student header", async () => {
    mockCommon("SCHOOL_ADMIN", CARD);
    renderPage();

    expect(await screen.findByText("Sunrise College")).toBeInTheDocument();
    expect(screen.getByText("Oluwaseun Adeyemi")).toBeInTheDocument();
    expect(screen.getByText("SUN/2026/0001")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("English Language")).toBeInTheDocument();
    expect(screen.getByText("F9")).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("#5")).toBeInTheDocument();
  });

  // SPEC_V0.5.1.md §2.1/Q1(b): an already-graded orphan subject stays on
  // the report card, just flagged, never silently hidden.
  it("shows a 'Needs a teacher assigned' badge when needsTeacherAssignment is true", async () => {
    mockCommon("SCHOOL_ADMIN", {
      ...CARD,
      subjects: [{ ...CARD.subjects[0], needsTeacherAssignment: true }, CARD.subjects[1]],
    });
    renderPage();

    await screen.findByText("Mathematics");
    expect(screen.getByText("Needs a teacher assigned")).toBeInTheDocument();
  });

  it("distinguishes Abs, blank/not-entered, and a real 0 — never confusing one for another", async () => {
    mockCommon("SCHOOL_ADMIN", CARD);
    renderPage();

    const mathHeading = await screen.findByText("Mathematics");
    const mathSubject = within(mathHeading.closest("div.break-inside-avoid")!);
    // Mathematics: CA1 = real 0, CA2 = Abs, CA3 = blank/not-entered.
    expect(mathSubject.getByText("Abs")).toBeInTheDocument();
    expect(mathSubject.getAllByText("—").length).toBeGreaterThan(0);
    // The real 0 sits beside CA1's row, distinct from the blank "—" for CA3.
    const ca1Row = mathSubject.getByText("CA 1").closest("li");
    expect(ca1Row).not.toBeNull();
    expect(ca1Row!.textContent).toContain("0");
  });

  it("shows the per-evaluation breakdown — name, description, and score, each listed separately", async () => {
    mockCommon("SCHOOL_ADMIN", CARD);
    renderPage();

    await screen.findByText("Mathematics");
    expect(screen.getByText("First continuous assessment")).toBeInTheDocument();
    expect(screen.getByText("Second continuous assessment")).toBeInTheDocument();
    expect(screen.getByText("Third continuous assessment")).toBeInTheDocument();
  });

  it("v0.7 step 5: renders class average/best/worst as anonymous numbers, and renders nothing for a null (unavailable) stat", async () => {
    mockCommon("SCHOOL_ADMIN", CARD);
    renderPage();

    const mathHeading = await screen.findByText("Mathematics");
    const mathSubject = within(mathHeading.closest("div.break-inside-avoid")!);
    // Subject-level class average.
    expect(mathSubject.getByText("Class avg 42")).toBeInTheDocument();
    // CA1's per-evaluation stats.
    expect(mathSubject.getByText("Class avg 45 · Best 90 · Worst 0")).toBeInTheDocument();
    // CA2 (absent) and CA3 (blank) have null stats in the fixture — nothing
    // extra renders for them (only one "Class avg 45..." line exists, not
    // one per evaluation).
    expect(mathSubject.getAllByText(/Class avg/).length).toBe(2); // the subject line + CA1's line only

    const englishHeading = screen.getByText("English Language");
    const englishSubject = within(englishHeading.closest("div.break-inside-avoid")!);
    expect(englishSubject.getByText("Class avg 68")).toBeInTheDocument();
    expect(englishSubject.getByText("Class avg 50 · Best 60 · Worst 40")).toBeInTheDocument();
  });

  it("v0.7 step 5: renders the general class average beside the overall block, absent when null", async () => {
    mockCommon("SCHOOL_ADMIN", {
      ...CARD,
      overall: { averageScore: 75, averageGrade: "B3", overallPosition: 2, status: "PUBLISHED", subjectsCount: 2, generalClassAverage: 58 },
    });
    renderPage();

    await screen.findByText("Mathematics");
    expect(screen.getByText("Class avg 58")).toBeInTheDocument();
  });

  it("a subject with zero evaluations entered shows an empty (not broken) breakdown", async () => {
    mockCommon("SCHOOL_ADMIN", { ...CARD, subjects: [{ ...CARD.subjects[0], evaluations: [] }, CARD.subjects[1]] });
    renderPage();

    await screen.findByText("Mathematics");
    expect(screen.getByText("No evaluations entered for this subject yet.")).toBeInTheDocument();
  });

  it("partial-term states: null overall renders a message (not a blank/zeroed row), a DRAFT subject shows its status, and a null position reads 'Not yet ranked'", async () => {
    mockCommon("SCHOOL_ADMIN", CARD);
    renderPage();

    await screen.findByText("Mathematics");
    expect(screen.getByText("Overall results not yet available.")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Pending approval")).toBeInTheDocument();
    expect(screen.getByText("Not yet ranked")).toBeInTheDocument();
  });

  it("no subjects entered this term: an empty-state message, not a bare page", async () => {
    mockCommon("SCHOOL_ADMIN", { ...CARD, subjects: [] });
    renderPage();

    expect(await screen.findByText("No results entered for this term yet.")).toBeInTheDocument();
  });
});

describe("ReportCardPage — remark visibility and rendering", () => {
  it("remark text is always shown to any viewer, with author + timestamp — regardless of edit-form access", async () => {
    mockCommon("SCHOOL_ADMIN", CARD);
    renderPage();

    // The admin's own edit form for this remark is pre-filled with the same
    // text (a <textarea>'s initial value renders as DOM text content too),
    // so scope to the read-only display paragraph specifically.
    expect(await screen.findByText("Keep up the effort next term.", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/Adaobi Nwachukwu/)).toBeInTheDocument();
    expect(screen.getByText("No remark yet.")).toBeInTheDocument(); // teacher remark, unset
  });

  it("SCHOOL_ADMIN sees BOTH the teacher-remark and principal-remark forms", async () => {
    mockCommon("SCHOOL_ADMIN", CARD);
    renderPage();

    await screen.findByText("Mathematics");
    expect(screen.getByRole("textbox", { name: "Teacher remark" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Principal remark" })).toBeInTheDocument();
  });

  it("TEACHER who IS the class teacher of this arm sees only the teacher-remark form", async () => {
    mockCommon("TEACHER", CARD, { classTeacherOf: [{ classArmId: "arm1", className: "JSS 1 A", sessionId: "sess1", sessionName: "2026/2027", enrollmentCount: 20 }] });
    renderPage();

    await screen.findByText("Mathematics");
    expect(screen.getByRole("textbox", { name: "Teacher remark" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Principal remark" })).not.toBeInTheDocument();
  });

  it("a subject-only TEACHER (not the class teacher) sees neither remark form, but still reads the existing remark text", async () => {
    mockCommon("TEACHER", CARD, { classTeacherOf: [] });
    renderPage();

    await screen.findByText("Mathematics");
    expect(screen.getByText("Keep up the effort next term.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Teacher remark" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Principal remark" })).not.toBeInTheDocument();
  });

  it("saving a remark shows the current user's own name immediately, not a raw id, while the background refetch lands the authoritative copy", async () => {
    // A real backend's GET reflects a just-written PUT — this mock's GET
    // must too, or the mutation's own invalidateQueries background refetch
    // (patchRemark, use-remarks.ts) immediately stomps the optimistic patch
    // back to the stale unwritten fixture, which isn't what production does.
    let currentCard = CARD;
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/classes") return CLASSES;
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/me/teaching") {
        return { classTeacherOf: [], subjects: [], currentSessionId: "sess1", currentTermId: "term1", currentTermName: "FIRST" };
      }
      if (path === "/api/v1/students/st1/report-card") return currentCard;
      if (path === "/api/v1/students/st1/remarks/teacher" && method === "PUT") {
        currentCard = {
          ...currentCard,
          remarks: {
            ...currentCard.remarks,
            teacherRemark: "Great improvement in class participation.",
            teacherRemarkBy: { firstName: "Adaobi", lastName: "Nwachukwu" },
            teacherRemarkAt: "2026-12-15T10:00:00Z",
          },
        };
        return {
          id: "rem1",
          studentId: "st1",
          termId: "term1",
          sessionId: "sess1",
          classArmId: "arm1",
          teacherRemark: "Great improvement in class participation.",
          teacherRemarkBy: "u1",
          teacherRemarkAt: "2026-12-15T10:00:00Z",
          principalRemark: CARD.remarks.principalRemark,
          principalRemarkBy: "u1",
          principalRemarkAt: CARD.remarks.principalRemarkAt,
        };
      }
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Mathematics");
    const textarea = screen.getByRole("textbox", { name: "Teacher remark" });
    await user.type(textarea, "Great improvement in class participation.");
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]);

    await waitFor(() => expect(screen.getByText("Great improvement in class participation.", { selector: "p" })).toBeInTheDocument());
    // Both remarks are now authored by Adaobi (the principal remark already
    // was, in the fixture) — two author lines, not a raw id anywhere.
    expect(screen.getAllByText(/Adaobi Nwachukwu/)).toHaveLength(2);
  });
});

describe("ReportCardPage — print controls", () => {
  it("the picker, back button, and print button are hidden in print output", async () => {
    mockCommon("SCHOOL_ADMIN", CARD);
    const { container } = renderPage();

    await screen.findByText("Mathematics");
    expect(container.querySelectorAll('[class*="print:hidden"]').length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Print/ })).toBeInTheDocument();
  });
});
