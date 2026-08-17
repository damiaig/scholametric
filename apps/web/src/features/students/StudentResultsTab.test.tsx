import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Paginated, Term, AcademicSession, StudentResultsResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest, ApiError } from "../../lib/api-client";
import { StudentResultsTab } from "./StudentResultsTab";

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

const RESULTS: StudentResultsResponse = {
  studentId: "st1",
  termId: "term1",
  sessionId: "sess1",
  subjects: [
    {
      subjectId: "sub1",
      subjectName: "Mathematics",
      totalScore: 56,
      autoGrade: "C5",
      overrideGrade: null,
      finalGrade: "C5",
      classAverageScore: 33,
      classAverageGrade: "F9",
      subjectPosition: null,
      status: "PENDING_APPROVAL",
    },
  ],
  overall: null,
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("StudentResultsTab", () => {
  it("ADMIN: renders the subject's grade/class-average/status, 'Not yet ranked' for a null position, and 'No results yet' for a null overall", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/students/st1/results") return RESULTS;
      throw new Error(`unexpected call: ${path}`);
    });

    renderWithProviders(<StudentResultsTab studentId="st1" />);

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText(/C5/)).toBeInTheDocument();
    expect(screen.getByText(/F9/)).toBeInTheDocument(); // class average, distinct from the student's own C5
    expect(screen.getByText("Not yet ranked")).toBeInTheDocument();
    expect(screen.getByText("No results yet.")).toBeInTheDocument();
  });

  it("TEACHER with no relationship to the student: renders a graceful 'no access' message, not a crash or blank", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/auth/me") return TEACHER_USER;
      if (path === "/api/v1/me/teaching") {
        return { classTeacherOf: [], subjects: [], currentSessionId: "sess1", currentTermId: "term1", currentTermName: "FIRST" };
      }
      if (path === "/api/v1/students/st1/results") {
        throw new ApiError(403, { statusCode: 403, message: "You do not teach this student.", error: "Forbidden", path: "", timestamp: "" });
      }
      throw new Error(`unexpected call: ${path}`);
    });

    renderWithProviders(<StudentResultsTab studentId="st1" />);

    expect(await screen.findByText("You don't have access to this student's results.")).toBeInTheDocument();
    // No generic "Try again" retry button for a permission error — retrying won't help.
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("'Print report card' navigates to the dedicated route, pre-filling the term/session already showing here", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/students/st1/results") return RESULTS;
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/students/:id" element={<StudentResultsTab studentId="st1" />} />
        <Route path="/students/:id/report-card" element={<p>report-card-route-marker</p>} />
      </Routes>,
      { route: "/students/st1" },
    );

    await screen.findByText("Mathematics");
    await user.click(screen.getByRole("button", { name: "Print report card" }));

    expect(await screen.findByText("report-card-route-marker")).toBeInTheDocument();
  });

  it("empty state: zero subjects entered this term", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/auth/me") return ADMIN_USER;
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/terms") return TERMS;
      if (path === "/api/v1/students/st1/results") return { ...RESULTS, subjects: [], overall: null };
      throw new Error(`unexpected call: ${path}`);
    });

    renderWithProviders(<StudentResultsTab studentId="st1" />);

    expect(await screen.findByText("No results entered for this term yet.")).toBeInTheDocument();
  });
});
