import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createTestQueryClient } from "../test/render-with-providers";
import { authStore } from "../lib/auth-store";
import { apiRequest } from "../lib/api-client";
import { AppRoutes } from "../App";

// Mounts every registered route (App.tsx's <AppRoutes>) with mocked auth and
// asserts each renders without throwing — a page that crashes to a blank
// screen (like the JOB_TITLE_LABELS bug this test was added to guard
// against, see docs/DECISIONS.md) fails this test, whatever else does or
// doesn't cover it. This is deliberately a *rendering* smoke test, not a
// data-correctness test: every non-auth endpoint below either 404s or
// returns a minimal-but-real-shaped fixture, and every route is expected to
// reach a stable state (success, error, or empty) without an uncaught
// exception either way.
vi.mock("../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const CURRENT_USER = {
  id: "u1",
  email: "admin@sunrise.test",
  firstName: "Adaobi",
  lastName: "Nwachukwu",
  role: "SCHOOL_ADMIN",
  status: "ACTIVE",
  lastLoginAt: null,
  school: {
    id: "s1",
    name: "Sunrise College",
    slug: "sunrise",
    type: "SECONDARY",
    status: "ACTIVE",
    address: null,
    phone: null,
    email: null,
  },
};

const PAGINATED_EMPTY = { items: [], total: 0, page: 1, pageSize: 20 };

const PERSONNEL_ROW = {
  id: "p1",
  schoolId: "s1",
  email: "teacher1@sunrise.test",
  firstName: "Bola",
  lastName: "Ogundare",
  role: "TEACHER",
  status: "ACTIVE",
  lastLoginAt: null,
  staffProfileId: "sp1",
  staffNumber: "SUN/STF/0001",
  jobTitle: "TEACHER",
  phone: null,
  qualification: null,
  dateEmployed: null,
};

const TEACHER_DETAIL = { ...PERSONNEL_ROW, classTeacherOf: [], subjectsTaught: [] };

const CLASS_LEVEL_OVERVIEW = [
  {
    id: "lvl1",
    name: "JSS 1",
    rank: 1,
    arms: [{ id: "arm1", name: "A", enrollmentCount: 1, classTeacher: null }],
  },
];

const CLASS_ARM_DETAIL = {
  id: "arm1",
  name: "A",
  classLevel: { id: "lvl1", name: "JSS 1", rank: 1 },
  classTeacher: null,
  subjectTeachers: [],
  students: PAGINATED_EMPTY,
};

const STUDENT_ROW = {
  id: "st1",
  schoolId: "s1",
  admissionNumber: "SUN/2026/0001",
  firstName: "Wale",
  lastName: "Akintola",
  middleName: null,
  gender: "MALE",
  dateOfBirth: "2013-01-01",
  admittedOn: "2026-01-01",
  status: "ACTIVE",
  guardianName: "Guardian",
  guardianPhone: "+2340000000",
  guardianEmail: null,
  address: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  currentEnrollment: null,
  primaryGuardian: null,
};

const STUDENT_DETAIL = { ...STUDENT_ROW, guardians: [] };

const DASHBOARD_STATS = {
  totalActiveStudents: 0,
  studentsByLevel: [],
  currentSession: null,
  currentTerm: null,
};

function mockApi() {
  mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
    const method = opts?.method ?? "GET";

    if (path === "/api/v1/auth/me") return CURRENT_USER;
    if (path === "/api/v1/dashboard/stats") return DASHBOARD_STATS;

    if (path === "/api/v1/students" && method === "GET") return { ...PAGINATED_EMPTY, items: [STUDENT_ROW] };
    if (path === "/api/v1/students/route-smoke-id") return STUDENT_DETAIL;
    if (path === "/api/v1/students/route-smoke-id/guardians") return [];
    if (path === "/api/v1/audit-logs") return PAGINATED_EMPTY;

    if (path === "/api/v1/teachers") return { ...PAGINATED_EMPTY, items: [PERSONNEL_ROW] };
    if (path === "/api/v1/teachers/route-smoke-id") return TEACHER_DETAIL;
    if (path === "/api/v1/personnel") return { ...PAGINATED_EMPTY, items: [PERSONNEL_ROW] };

    if (path === "/api/v1/classes") return CLASS_LEVEL_OVERVIEW;
    if (path === "/api/v1/class-arms/route-smoke-id") return CLASS_ARM_DETAIL;
    if (path === "/api/v1/class-arms") return PAGINATED_EMPTY;
    if (path === "/api/v1/class-levels") return PAGINATED_EMPTY;
    if (path === "/api/v1/subjects") return PAGINATED_EMPTY;

    if (path === "/api/v1/sessions") return PAGINATED_EMPTY;
    if (path === "/api/v1/terms") return PAGINATED_EMPTY;

    throw new Error(`route-smoke.test.tsx: unexpected apiRequest call: ${method} ${path}`);
  });
}

// Every concrete path a user could actually land on — mirrors App.tsx's
// <AppRoutes> route list 1:1. Dynamic segments use a fixed fake id; the
// mock above returns real-shaped detail fixtures for exactly that id.
const ROUTES = [
  "/dashboard",
  "/students",
  "/students/new",
  "/students/route-smoke-id",
  "/teachers",
  "/teachers/route-smoke-id",
  "/classes",
  "/classes/arms/route-smoke-id",
  "/personnel",
  "/settings/school",
  "/settings/academic",
];

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
  mockApi();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("route smoke test — every registered route renders without throwing", () => {
  it.each(ROUTES)("mounts %s without an uncaught error", async (route) => {
    const queryClient = createTestQueryClient();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Something App-shell-shaped ("Sunrise College" in the sidebar) should
    // show up once the route settles — proof the tree actually rendered
    // rather than the test just timing out.
    await waitFor(() => expect(screen.getAllByText("Sunrise College").length).toBeGreaterThan(0));

    // The route-level RouteErrorBoundary (ProtectedLayout.tsx) turns a
    // render crash into this exact message — its presence, not a thrown
    // exception, is what a real crash looks like from the outside (React
    // itself swallows the error once a boundary catches it).
    expect(screen.queryByText("Something went wrong.")).not.toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });
});
