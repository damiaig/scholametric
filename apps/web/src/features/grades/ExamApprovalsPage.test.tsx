import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ExamReviewResponse, Paginated, Term, AcademicSession } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ExamApprovalsPage } from "./ExamApprovalsPage";

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

const REVIEW_PENDING: ExamReviewResponse = {
  classArmId: "arm1",
  termId: "term1",
  subjects: [
    { subjectId: "sub1", subjectName: "Mathematics", needsTeacherAssignment: false, rosterSize: 20, draftCount: 0, pendingApprovalCount: 20, publishedCount: 0, averageScore: 56, averageGrade: "C5" },
  ],
};
const REVIEW_DRAFT: ExamReviewResponse = {
  classArmId: "arm1",
  termId: "term1",
  subjects: [
    { subjectId: "sub2", subjectName: "English Language", needsTeacherAssignment: false, rosterSize: 20, draftCount: 20, pendingApprovalCount: 0, publishedCount: 0, averageScore: 0, averageGrade: null },
  ],
};
const REVIEW_PUBLISHED: ExamReviewResponse = {
  classArmId: "arm1",
  termId: "term1",
  subjects: [
    { subjectId: "sub3", subjectName: "Biology", needsTeacherAssignment: false, rosterSize: 20, draftCount: 0, pendingApprovalCount: 0, publishedCount: 20, averageScore: 61, averageGrade: "C6" },
  ],
};

function mockCommon(role: "SCHOOL_ADMIN" | "PROPRIETOR", review: ExamReviewResponse) {
  mockedApiRequest.mockImplementation(async (path, options) => {
    if (path === "/api/v1/auth/me") return currentUser(role);
    if (path === "/api/v1/classes") return CLASSES;
    if (path === "/api/v1/sessions") return SESSIONS;
    if (path === "/api/v1/terms") return TERMS;
    if (path === "/api/v1/exams/review") {
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

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — a deliberately separate page from
// ReviewPublishPage (kept read-only per v0.7.4 step 1): this one is the
// admin's ONLY route to PUBLISHED for the exam track now.
describe("ExamApprovalsPage", () => {
  it("shows Approve/Reject buttons only when a subject has pending exam results", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_PENDING);
    renderWithProviders(<ExamApprovalsPage />, { route: "/grades/exam-approvals?classArmId=arm1" });

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("hides Approve/Reject when nothing is pending (still draft)", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_DRAFT);
    renderWithProviders(<ExamApprovalsPage />, { route: "/grades/exam-approvals?classArmId=arm1" });

    expect(await screen.findByText("English Language")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("hides Approve/Reject when everything is already published", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_PUBLISHED);
    renderWithProviders(<ExamApprovalsPage />, { route: "/grades/exam-approvals?classArmId=arm1" });

    expect(await screen.findByText("Biology")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("shows the 'Pending approval' tier badge when a subject has pending rows", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_PENDING);
    renderWithProviders(<ExamApprovalsPage />, { route: "/grades/exam-approvals?classArmId=arm1" });

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Pending approval")).toBeInTheDocument();
  });

  it("PROPRIETOR clicking Approve confirms and calls POST /exams/approve with the subject id", async () => {
    mockCommon("PROPRIETOR", REVIEW_PENDING);
    mockedApiRequest.mockImplementation(async (path, options) => {
      if (path === "/api/v1/auth/me") return currentUser("PROPRIETOR");
      if (path === "/api/v1/classes") return CLASSES;
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/exams/review") return REVIEW_PENDING;
      if (path === "/api/v1/exams/approve") {
        expect(options?.body).toEqual({ classArmId: "arm1", subjectId: "sub1", termId: "term1" });
        return { classArmId: "arm1", subjectId: "sub1", termId: "term1", approvedCount: 20, termExamPublishedCount: 20, yearExamRecomputedCount: 20 };
      }
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<ExamApprovalsPage />, { route: "/grades/exam-approvals?classArmId=arm1" });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    // Two "Approve" buttons now exist: the row action and the dialog's
    // own confirm button — the dialog's is rendered last.
    const confirmButton = screen.getAllByRole("button", { name: "Approve" }).slice(-1)[0];
    await user.click(confirmButton);

    await waitFor(() =>
      expect(mockedApiRequest).toHaveBeenCalledWith(
        "/api/v1/exams/approve",
        expect.objectContaining({ method: "POST", body: { classArmId: "arm1", subjectId: "sub1", termId: "term1" } }),
      ),
    );
  });

  it("clicking Reject confirms and calls POST /exams/reject with the subject id", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_PENDING);
    mockedApiRequest.mockImplementation(async (path, options) => {
      if (path === "/api/v1/auth/me") return currentUser("SCHOOL_ADMIN");
      if (path === "/api/v1/classes") return CLASSES;
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/exams/review") return REVIEW_PENDING;
      if (path === "/api/v1/exams/reject") {
        expect(options?.body).toEqual({ classArmId: "arm1", subjectId: "sub1", termId: "term1" });
        return { classArmId: "arm1", subjectId: "sub1", termId: "term1", rejectedCount: 20 };
      }
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<ExamApprovalsPage />, { route: "/grades/exam-approvals?classArmId=arm1" });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const confirmButton = screen.getAllByRole("button", { name: "Reject" }).slice(-1)[0];
    await user.click(confirmButton);

    await waitFor(() =>
      expect(mockedApiRequest).toHaveBeenCalledWith(
        "/api/v1/exams/reject",
        expect.objectContaining({ method: "POST", body: { classArmId: "arm1", subjectId: "sub1", termId: "term1" } }),
      ),
    );
  });
});
