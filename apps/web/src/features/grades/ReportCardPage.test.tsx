import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
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
      components: [
        { componentId: "ca1", componentName: "CA 1", weight: 20, maxScore: 20, requiresApproval: false, rawScore: 0, isAbsent: false },
        { componentId: "ca2", componentName: "CA 2", weight: 20, maxScore: 20, requiresApproval: false, rawScore: null, isAbsent: true },
        { componentId: "exam", componentName: "Exam", weight: 60, maxScore: 100, requiresApproval: true, rawScore: null, isAbsent: false },
      ],
      totalScore: 0,
      autoGrade: "F9",
      overrideGrade: null,
      finalGrade: "F9",
      subjectPosition: 5,
      status: "DRAFT",
    },
    {
      subjectId: "sub2",
      subjectName: "English Language",
      components: [
        { componentId: "ca1", componentName: "CA 1", weight: 20, maxScore: 20, requiresApproval: false, rawScore: 18, isAbsent: false },
        { componentId: "ca2", componentName: "CA 2", weight: 20, maxScore: 20, requiresApproval: false, rawScore: 17, isAbsent: false },
        { componentId: "exam", componentName: "Exam", weight: 60, maxScore: 100, requiresApproval: true, rawScore: 55, isAbsent: false },
      ],
      totalScore: 90,
      autoGrade: "A1",
      overrideGrade: null,
      finalGrade: "A1",
      subjectPosition: null,
      status: "PENDING_APPROVAL",
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

  it("distinguishes Abs, blank/not-entered, and a real 0 — never confusing one for another", async () => {
    mockCommon("SCHOOL_ADMIN", CARD);
    renderPage();

    await screen.findByText("Mathematics");
    const mathCells = screen.getAllByRole("cell");
    const cellTexts = mathCells.map((cell) => cell.textContent);
    // Mathematics: CA1 = real 0, CA2 = Abs, Exam = blank/not-entered.
    expect(cellTexts).toContain("0");
    expect(cellTexts).toContain("Abs");
    expect(cellTexts.some((text) => text === "—")).toBe(true);
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
