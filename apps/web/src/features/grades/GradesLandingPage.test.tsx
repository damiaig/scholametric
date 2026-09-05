import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { ClassLevelOverview, MyTeaching } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { GradesLandingPage } from "./GradesLandingPage";

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

const ADMIN_USER = {
  ...TEACHER_USER,
  id: "u1",
  email: "admin@sunrise.test",
  firstName: "Adaobi",
  lastName: "Nwachukwu",
  role: "SCHOOL_ADMIN",
};

const TEACHING: MyTeaching = {
  classTeacherOf: [
    {
      classArmId: "arm1",
      className: "SSS 2 A",
      sessionId: "sess1",
      sessionName: "2026/2027",
      enrollmentCount: 30,
    },
  ],
  subjects: [
    {
      id: "sa1",
      subjectId: "sub1",
      subjectName: "Mathematics",
      classArmId: "arm2",
      className: "JSS 1 A",
    },
  ],
  currentSessionId: "sess1",
  currentTermId: "term1",
  currentTermName: "FIRST",
};

const CLASSES: ClassLevelOverview[] = [
  {
    id: "lvl1",
    name: "JSS 1",
    rank: 1,
    arms: [{ id: "arm2", name: "A", enrollmentCount: 25, classTeacher: null }],
  },
  {
    id: "lvl2",
    name: "SSS 2",
    rank: 2,
    arms: [{ id: "arm1", name: "A", enrollmentCount: 30, classTeacher: null }],
  },
];

function mockTeacher(teaching: unknown = TEACHING) {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return TEACHER_USER;
    if (path.includes("/me/teaching")) return teaching;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

function mockAdmin(classes: unknown = CLASSES) {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return ADMIN_USER;
    if (path === "/api/v1/classes") return classes;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

// v0.7.2 step 2 (SPEC_V0.7.2.md §3) — renamed from TeacherGradesPage: the
// class page no longer hosts any grading UI, so SCHOOL_ADMIN/PROPRIETOR
// now land here too. Content forks by role.
describe("GradesLandingPage — TEACHER view", () => {
  it("renders 'Classes I teach' cards linking straight into that class's Results tab, under /grades/arms/:id", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockTeacher();

    renderWithProviders(<GradesLandingPage />);

    const classCard = await screen.findByRole("link", { name: /SSS 2 A/ });
    expect(classCard).toHaveAttribute("href", "/grades/arms/arm1?tab=results");
    expect(screen.getByText("30 students")).toBeInTheDocument();
  });

  it("renders 'Subjects I teach' rows: class link goes to Results, action links go to Enter-scores for the right subject/track", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockTeacher();

    renderWithProviders(<GradesLandingPage />);

    await screen.findByText("Mathematics");
    expect(screen.getByRole("link", { name: "JSS 1 A" })).toHaveAttribute(
      "href",
      "/grades/arms/arm2?tab=results",
    );
    expect(screen.getByRole("link", { name: "Enter grades" })).toHaveAttribute(
      "href",
      "/grades/arms/arm2?tab=enter&subjectId=sub1&track=evaluations",
    );
    expect(
      screen.getByRole("link", { name: "Enter exam scores" }),
    ).toHaveAttribute(
      "href",
      "/grades/arms/arm2?tab=enter&subjectId=sub1&track=exams",
    );
  });

  it("no assignments: shows the same empty state MyClassesView uses, not an error", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockTeacher({
      classTeacherOf: [],
      subjects: [],
      currentSessionId: null,
      currentTermId: null,
      currentTermName: null,
    });

    renderWithProviders(<GradesLandingPage />);

    expect(
      await screen.findByText(
        "You have no class assignments yet — your school admin assigns these.",
      ),
    ).toBeInTheDocument();
  });

  it("load failure shows the error message with a retry button, not a crash", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return TEACHER_USER;
      if (path.includes("/me/teaching")) throw new Error("boom");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<GradesLandingPage />);

    expect(
      await screen.findByText("Couldn't load your teaching load."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

// v0.7.2 step 2, Q4 — the admin/proprietor path: with the class page's
// Grades button removed, admin now browses school-wide from here,
// reusing useClasses() (the SAME hook ClassesPage already calls, no new
// endpoint) instead of useMyTeaching() (which only knows a TEACHER's own
// assignments, not "every class an admin can grade in").
describe("GradesLandingPage — SCHOOL_ADMIN/PROPRIETOR view", () => {
  it("renders every class arm school-wide, grouped by level, linking to that arm's Results tab", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockAdmin();

    renderWithProviders(<GradesLandingPage />);

    expect(await screen.findByText("JSS 1")).toBeInTheDocument();
    expect(screen.getByText("SSS 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /JSS 1 A/ })).toHaveAttribute(
      "href",
      "/grades/arms/arm2?tab=results",
    );
    expect(screen.getByRole("link", { name: /SSS 2 A/ })).toHaveAttribute(
      "href",
      "/grades/arms/arm1?tab=results",
    );
    expect(screen.getByText("25 students")).toBeInTheDocument();
  });

  it("no classes set up yet: shows a named empty state, not an error", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockAdmin([{ id: "lvl1", name: "JSS 1", rank: 1, arms: [] }]);

    renderWithProviders(<GradesLandingPage />);

    expect(
      await screen.findByText(
        "No classes have been set up yet — add one from the Classes page.",
      ),
    ).toBeInTheDocument();
  });

  it("load failure shows the error message with a retry button, not a crash", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return ADMIN_USER;
      if (path === "/api/v1/classes") throw new Error("boom");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<GradesLandingPage />);

    expect(
      await screen.findByText("Couldn't load classes."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("PROPRIETOR gets the same school-wide view as SCHOOL_ADMIN", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me"))
        return { ...ADMIN_USER, role: "PROPRIETOR" };
      if (path === "/api/v1/classes") return CLASSES;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<GradesLandingPage />);

    expect(
      await screen.findByRole("link", { name: /SSS 2 A/ }),
    ).toHaveAttribute("href", "/grades/arms/arm1?tab=results");
  });
});
