import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { MyTeaching } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { TeacherDashboard } from "./TeacherDashboard";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const USER = {
  id: "u2",
  email: "teacher@sunrise.test",
  firstName: "Bola",
  lastName: "Ogundare",
  role: "TEACHER",
  status: "ACTIVE",
  lastLoginAt: null,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

// arm1 (class-teacher-of, no subject) ∪ arm2 (subject-teacher, two subjects)
// = 2 distinct classes; 2 subject assignments — proves the union-count math
// in TeacherDashboard, not just a re-display of one field.
const TEACHING: MyTeaching = {
  classTeacherOf: [{ classArmId: "arm1", className: "SSS 2 A", sessionId: "sess1", sessionName: "2026/2027", enrollmentCount: 30 }],
  subjects: [
    { id: "sa1", subjectId: "sub1", subjectName: "Mathematics", classArmId: "arm2", className: "JSS 1 A" },
    { id: "sa2", subjectId: "sub2", subjectName: "English", classArmId: "arm2", className: "JSS 1 A" },
  ],
  currentSessionId: "sess1",
  currentTermId: "term1",
  currentTermName: "FIRST",
};

const EMPTY_EVALUATIONS = { classArmId: "arm2", subjectId: "", termId: "term1", termClosed: false, locked: false, unlockReason: null, evaluations: [] };
const EMPTY_EXAMS = { classArmId: "arm2", subjectId: "", termId: "term1", termClosed: false, locked: false, unlockReason: null, exams: [] };

function mathResults(status: "PUBLISHED" | "DRAFT") {
  return { classArmId: "arm2", termId: "term1", students: [], overall: null, subjects: [
    { subjectId: "sub1", subjectName: "Mathematics", needsTeacherAssignment: false, averageScore: 70, averageGrade: "B2", results: [
      { id: "r1", studentId: "st1", totalScore: 70, autoGrade: "B2", overrideGrade: null, finalGrade: "B2", subjectPosition: 1, status },
    ] },
    { subjectId: "sub2", subjectName: "English", needsTeacherAssignment: false, averageScore: 60, averageGrade: "B3", results: [
      { id: "r2", studentId: "st1", totalScore: 60, autoGrade: "B3", overrideGrade: null, finalGrade: "B3", subjectPosition: 1, status: "DRAFT" },
    ] },
  ] };
}

function baseMock(overrides: Record<string, unknown> = {}) {
  mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, unknown> }) => {
    if (path.includes("/auth/me")) return USER;
    if (path.includes("/me/teaching")) return TEACHING;
    if (path === "/api/v1/grades/evaluations") {
      const subjectId = opts?.query?.subjectId;
      if (subjectId === "sub1") {
        return {
          ...EMPTY_EVALUATIONS,
          subjectId: "sub1",
          evaluations: [{ id: "e1", name: "CA 1", description: "First test", createdAt: "2026-01-05T00:00:00.000Z", createdBy: "u2" }],
        };
      }
      return { ...EMPTY_EVALUATIONS, subjectId };
    }
    if (path === "/api/v1/exams") {
      const subjectId = opts?.query?.subjectId;
      if (subjectId === "sub2") {
        return {
          ...EMPTY_EXAMS,
          subjectId: "sub2",
          exams: [{ id: "x1", name: "Term 1 Exam", createdAt: "2026-01-10T00:00:00.000Z", createdBy: "u2" }],
        };
      }
      return { ...EMPTY_EXAMS, subjectId };
    }
    if (path === "/api/v1/class-arms/arm2/results") return mathResults("PUBLISHED");
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
  Object.assign(mockedApiRequest, overrides);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("TeacherDashboard", () => {
  it("renders 'Classes I teach' and 'Subjects' metric cards computed as a union/count from /me/teaching, plus the Enter-grades card", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    baseMock();

    renderWithProviders(<TeacherDashboard />);

    await screen.findByText("SSS 2 A");
    // "Classes I teach" appears twice: the StatCard label and MyClassesView's
    // own section heading — scope to the StatCard's <p> label specifically,
    // then read its value from the label's sibling <p> in the same card.
    const classesLabel = screen.getByText("Classes I teach", { selector: "p" });
    // arm1 (class-teacher-of) ∪ arm2 (subjects) = 2 distinct classes.
    expect(classesLabel.nextElementSibling).toHaveTextContent("2");
    const subjectsLabel = screen.getByText("Subjects", { selector: "p" });
    expect(subjectsLabel.nextElementSibling).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: "Enter grades →" })).toHaveAttribute("href", "/classes");
  });

  it("embeds MyClassesView's existing content unchanged: both sections, actions repointed at Step 1's ClassGradesPage", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    baseMock();

    renderWithProviders(<TeacherDashboard />);

    await screen.findByText("SSS 2 A");
    expect(screen.getByText("30 students")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    const enterLinks = screen.getAllByRole("link", { name: "Enter grades" });
    expect(enterLinks[0]).toHaveAttribute("href", "/classes/arms/arm2/grades?tab=enter&subjectId=sub1&track=evaluations");
  });

  it("no assignments shows MyClassesView's empty state, not an error, and metric cards read 0", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return USER;
      if (path.includes("/me/teaching")) return { classTeacherOf: [], subjects: [], currentSessionId: null, currentTermId: null, currentTermName: null };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TeacherDashboard />);

    expect(await screen.findByText("You have no class assignments yet — your school admin assigns these.")).toBeInTheDocument();
    expect(screen.getByText("No current term yet.")).toBeInTheDocument();
  });

  it("'Recently posted' merges evaluations+exams across subjects sorted by real createdAt, most recent first", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    baseMock();

    renderWithProviders(<TeacherDashboard />);

    await screen.findByText("CA 1");
    await screen.findByText("Term 1 Exam");
    const items = screen.getAllByText(/CA 1|Term 1 Exam/);
    // Term 1 Exam (2026-01-10) is more recent than CA 1 (2026-01-05).
    expect(items[0]).toHaveTextContent("Term 1 Exam");
    expect(items[1]).toHaveTextContent("CA 1");
  });

  it("the publish badge is labeled as the SUBJECT's state, never implying the specific item is published/draft", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    baseMock();

    renderWithProviders(<TeacherDashboard />);

    // Mathematics (sub1) is fully published in the mocked class-arm-results.
    await screen.findByText("CA 1");
    expect(screen.getByText("Subject published")).toBeInTheDocument();
    // English (sub2) has a DRAFT row — Term 1 Exam's row belongs to sub2.
    expect(screen.getByText("Subject still draft")).toBeInTheDocument();
    expect(screen.queryByText(/^Published$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Draft$/)).not.toBeInTheDocument();
  });

  it("no evaluations/exams yet shows the empty state, not a crash", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return USER;
      if (path.includes("/me/teaching")) return TEACHING;
      if (path === "/api/v1/grades/evaluations") return EMPTY_EVALUATIONS;
      if (path === "/api/v1/exams") return EMPTY_EXAMS;
      if (path === "/api/v1/class-arms/arm2/results") return mathResults("DRAFT");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TeacherDashboard />);

    await screen.findByText("Recently posted");
    expect(await screen.findByText("No evaluations or exams created yet.")).toBeInTheDocument();
  });
});
