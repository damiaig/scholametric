import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { GradesReviewResponse, Paginated, Term, AcademicSession } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
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

const REVIEW_PARTIAL: GradesReviewResponse = {
  classArmId: "arm1",
  termId: "term1",
  subjects: [
    { subjectId: "sub1", subjectName: "Mathematics", needsTeacherAssignment: false, rosterSize: 20, draftCount: 2, pendingApprovalCount: 5, publishedCount: 13, averageScore: 56, averageGrade: "C5" },
  ],
};
const REVIEW_DRAFT: GradesReviewResponse = {
  classArmId: "arm1",
  termId: "term1",
  subjects: [
    { subjectId: "sub2", subjectName: "English Language", needsTeacherAssignment: false, rosterSize: 20, draftCount: 20, pendingApprovalCount: 0, publishedCount: 0, averageScore: 0, averageGrade: null },
  ],
};
const REVIEW_FULLY_PUBLISHED: GradesReviewResponse = {
  classArmId: "arm1",
  termId: "term1",
  subjects: [
    { subjectId: "sub3", subjectName: "Biology", needsTeacherAssignment: false, rosterSize: 20, draftCount: 0, pendingApprovalCount: 0, publishedCount: 20, averageScore: 61, averageGrade: "C6" },
  ],
};

function mockCommon(role: "SCHOOL_ADMIN" | "PROPRIETOR", review: GradesReviewResponse) {
  mockedApiRequest.mockImplementation(async (path, options) => {
    if (path === "/api/v1/auth/me") return currentUser(role);
    if (path === "/api/v1/classes") return CLASSES;
    if (path === "/api/v1/sessions") return SESSIONS;
    if (path === "/api/v1/terms") return TERMS;
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

// v0.7.4 step 1 (SPEC_V0.7.4.md §2) — this page is pure read-only
// oversight now: publish/unpublish moved to the evaluation surface
// (EnterScoresTab), so neither role sees an action button here anymore.
describe("ReviewPublishPage — read-only oversight (v0.7.4 step 1)", () => {
  it("SCHOOL_ADMIN sees no Publish/Unpublish buttons anywhere on this page", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_PARTIAL);
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
  });

  it("PROPRIETOR sees no Publish/Unpublish buttons anywhere on this page either", async () => {
    mockCommon("PROPRIETOR", REVIEW_PARTIAL);
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
  });

  // SPEC_V0.5.1.md §2.1/Q1(b): an already-graded orphan subject stays
  // visible in review, just flagged.
  it("shows a 'Needs a teacher assigned' badge when the subject has needsTeacherAssignment: true", async () => {
    mockCommon("SCHOOL_ADMIN", {
      ...REVIEW_PARTIAL,
      subjects: [{ ...REVIEW_PARTIAL.subjects[0], needsTeacherAssignment: true }],
    });
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Needs a teacher assigned")).toBeInTheDocument();
  });

  it("shows the per-status breakdown, not a single collapsed status", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_PARTIAL);
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText(/13 published/)).toBeInTheDocument();
    expect(screen.getByText(/5 pending/)).toBeInTheDocument();
    expect(screen.getByText(/2 not yet scored/)).toBeInTheDocument();
  });

  // v0.7.4 step 1 — the tier badge now describes CURRENT STATE only (no
  // more canPublish-driven "Waiting to publish" tier, since this page
  // offers no action to wait for).
  it("shows the 'Partially published' tier badge when some but not all of the roster is published", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_PARTIAL);
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Partially published")).toBeInTheDocument();
  });

  it("shows the 'Still in draft' tier badge when nothing is published yet", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_DRAFT);
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText("English Language")).toBeInTheDocument();
    expect(screen.getByText("Still in draft")).toBeInTheDocument();
  });

  it("shows the 'Published' tier badge when every roster row is published", async () => {
    mockCommon("SCHOOL_ADMIN", REVIEW_FULLY_PUBLISHED);
    renderWithProviders(<ReviewPublishPage />, { route: "/grades/review?classArmId=arm1" });

    expect(await screen.findByText("Biology")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });
});
