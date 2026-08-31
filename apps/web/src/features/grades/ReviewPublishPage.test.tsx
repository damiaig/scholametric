import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Evaluation, GradesReviewResponse, Paginated, Term, AcademicSession } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest, ApiError } from "../../lib/api-client";
import { ReviewPublishPage } from "./ReviewPublishPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

function currentUser(role: "SCHOOL_ADMIN" | "PROPRIETOR") {
  return {
    id: "u1",
    email: "admin@sunrise.test",
    firstName: "Adaobi",
    lastName: "Nwachukwu",
    role,
    status: "ACTIVE",
    lastLoginAt: null,
    school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
  };
}

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
const CLASSES = [{ id: "lvl1", name: "JSS 1", rank: 1, arms: [{ id: "arm1", name: "A", enrollmentCount: 20, classTeacher: null }] }];

const REVIEW_CAN_PUBLISH: GradesReviewResponse = {
  classArmId: "arm1",
  termId: "term1",
  subjects: [
    { subjectId: "sub1", subjectName: "Mathematics", needsTeacherAssignment: false, rosterSize: 20, draftCount: 2, pendingApprovalCount: 5, publishedCount: 13, averageScore: 56, averageGrade: "C5", canPublish: true },
  ],
};
const REVIEW_CANNOT_PUBLISH: GradesReviewResponse = {
  classArmId: "arm1",
  termId: "term1",
  subjects: [
    { subjectId: "sub2", subjectName: "English Language", needsTeacherAssignment: false, rosterSize: 20, draftCount: 20, pendingApprovalCount: 0, publishedCount: 0, averageScore: 0, averageGrade: null, canPublish: false },
  ],
};

function mockCommon(role: "SCHOOL_ADMIN" | "PROPRIETOR", review: GradesReviewResponse) {
  mockedApiRequest.mockImplementation(async (path, options) => {
    if (path === "/api/v1/auth/me") return currentUser(role);
    if (path === "/api/v1/classes") return CLASSES;
    if (path === "/api/v1/sessions") return SESSIONS;
    if (path === "/api/v1/terms") return TERMS;
    // PublishConfirmDialog is always mounted (gated internally, not by
    // conditional render) and fetches this to label a completeness-gate
    // 409 — fires regardless of whether the dialog is open.
    if (path === "/api/v1/grades/evaluations") {
      return { classArmId: "arm1", subjectId: "sub1", termId: "term1", termClosed: false, locked: false, unlockReason: null, evaluations: [] };
    }
    if (path === "/api/v1/grades/review") {
      const query = (options as { query?: Record<string, string> })?.query;
      expect(query?.classArmId).toBe("arm1");
      return review;
    }
    throw new Error(`unexpected call: ${path}`);
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

describe("ReviewPublishPage — owner-vs-admin control visibility", () => {
  it("SCHOOL_ADMIN sees Publish but never Unpublish, even on a published subject", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_CAN_PUBLISH);
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
  });

  it("PROPRIETOR sees both Publish and Unpublish on a subject with published rows", async () => {
    mockCommon("PROPRIETOR", REVIEW_CAN_PUBLISH);
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
  });

  it("Publish is disabled (not hidden) when canPublish is false — mirrors the server's own 409 condition", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_CANNOT_PUBLISH);
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText("English Language")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  // SPEC_V0.5.1.md §2.1/Q1(b): an already-graded orphan subject stays
  // visible in review, just flagged.
  it("shows a 'Needs a teacher assigned' badge when the subject has needsTeacherAssignment: true", async () => {
    mockCommon("SCHOOL_ADMIN", {
      ...REVIEW_CAN_PUBLISH,
      subjects: [{ ...REVIEW_CAN_PUBLISH.subjects[0], needsTeacherAssignment: true }],
    });
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Needs a teacher assigned")).toBeInTheDocument();
  });

  it("shows the per-status breakdown, not a single collapsed status", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_CAN_PUBLISH);
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText(/13 published/)).toBeInTheDocument();
    expect(screen.getByText(/5 pending/)).toBeInTheDocument();
    expect(screen.getByText(/2 not yet scored/)).toBeInTheDocument();
  });

  it("clicking Publish opens the confirm dialog naming class, subject, and term", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_CAN_PUBLISH);
    const user = userEvent.setup();
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    await screen.findByText("Mathematics");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/This publishes JSS 1 A Mathematics First term results/)).toBeInTheDocument();
  });

  it("clicking Unpublish (PROPRIETOR) opens a dialog naming the whole-class cascade, not just the one subject", async () => {
    mockCommon("PROPRIETOR", REVIEW_CAN_PUBLISH);
    const user = userEvent.setup();
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    await screen.findByText("Mathematics");
    await user.click(screen.getByRole("button", { name: "Unpublish" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/recomputes overall positions for the whole class/)).toBeInTheDocument();
  });

  it("publish 409s with incompleteEntries (the completeness-gate race): shows blocking evaluations grouped, not a generic toast", async () => {
    const evaluations: Evaluation[] = [
      { id: "ca1", name: "CA 1", description: "CA 1", createdAt: "t", createdBy: "u1" },
      { id: "examId", name: "Exam", description: "Exam", createdAt: "t", createdBy: "u1" },
    ];
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/auth/me") return currentUser("SCHOOL_ADMIN");
      if (path === "/api/v1/classes") return CLASSES;
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/grades/evaluations") {
        return { classArmId: "arm1", subjectId: "sub1", termId: "term1", termClosed: false, locked: false, unlockReason: null, evaluations };
      }
      if (path === "/api/v1/grades/review") return REVIEW_CAN_PUBLISH;
      if (path === "/api/v1/grades/publish" && method === "POST") {
        throw new ApiError(409, {
          statusCode: 409,
          message: "Cannot publish: 2 student(s) have at least one evaluation that's neither scored nor marked absent.",
          error: "Conflict",
          path: "",
          timestamp: "",
          incompleteEntries: [
            { studentId: "st1", evaluationId: "ca1" },
            { studentId: "st2", evaluationId: "examId" },
            { studentId: "st3", evaluationId: "examId" },
          ],
        });
      }
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    await screen.findByText("Mathematics");
    await user.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(within(dialog).getByText(/Some students still have a blank evaluation/)).toBeInTheDocument());
    expect(within(dialog).getByText(/CA 1: 1 student/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Exam: 2 students/)).toBeInTheDocument();
  });
});
