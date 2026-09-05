import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import type { ClassArmDetail } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ClassArmDetailPage } from "./ClassArmDetailPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const SCHOOL_ADMIN_USER = {
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
  },
};

const ARM_DETAIL: ClassArmDetail = {
  id: "arm-1",
  name: "A",
  classLevel: { id: "lvl-1", name: "JSS 1", rank: 1 },
  classTeacher: { userId: "t-1", firstName: "Bola", lastName: "Ogundare" },
  subjectTeachers: [
    {
      id: "sta-1",
      subjectId: "subj-1",
      subjectName: "Mathematics",
      teacherUserId: "t-1",
      teacherFirstName: "Bola",
      teacherLastName: "Ogundare",
    },
  ],
  students: {
    items: [
      {
        id: "st-1",
        firstName: "Chidi",
        lastName: "Okoro",
        admissionNumber: "SUN/2026/0001",
        status: "ACTIVE",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  },
};

function renderPage(role: string = "SCHOOL_ADMIN") {
  authStore.setTokens({
    accessToken: "access-token",
    refreshToken: "refresh-token",
  });
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return { ...SCHOOL_ADMIN_USER, role };
    if (path.includes("/class-arms/arm-1")) return ARM_DETAIL;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });

  return renderWithProviders(
    <Routes>
      <Route path="/classes/arms/:id" element={<ClassArmDetailPage />} />
    </Routes>,
    { route: "/classes/arms/arm-1" },
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("ClassArmDetailPage", () => {
  it("renders the class teacher, subject teachers, and enrolled students", async () => {
    renderPage();

    expect(await screen.findByText("JSS 1 A")).toBeInTheDocument();
    // Same teacher is both class teacher and a subject teacher in this
    // fixture; the subject-teachers list also renders twice (mobile card +
    // desktop table, only one visible per breakpoint via CSS) — jsdom
    // doesn't apply media queries, so both exist in the DOM at once.
    expect(screen.getAllByText("Bola Ogundare").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(screen.getAllByText("Mathematics").length).toBeGreaterThanOrEqual(1);
    const studentsSection = screen.getByText("Students").closest("section")!;
    const studentsTable = within(
      await within(studentsSection).findByRole("table"),
    );
    expect(studentsTable.getByText("Chidi Okoro")).toBeInTheDocument();
    expect(studentsTable.getByText("SUN/2026/0001")).toBeInTheDocument();
  });

  // v0.7.2 step 2 (SPEC_V0.7.2.md §3, item 3) — the class page is now a
  // read-only view/hub: zero grade entry or editing anywhere on it. The
  // "Grades" button, "Review & publish" button, and per-subject "Enter
  // grades"/"Enter exam scores" links are all gone — that whole workflow
  // moved to the Grades page (GradesLandingPage/ClassGradesPage). The
  // subject teachers list itself still renders (Mathematics, above), just
  // without the grading links attached to it.
  it("no Grades button, no Review & publish button, and no per-subject Enter-grades/Enter-exam-scores links render anywhere", async () => {
    renderPage();

    expect(await screen.findByText("JSS 1 A")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Grades" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Review & publish/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Enter grades" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Enter exam scores" }),
    ).not.toBeInTheDocument();
    // The staffing/roster affordances stay: assign/change class teacher,
    // add subject teacher, and remove-assignment controls are unaffected.
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add subject teacher/ }),
    ).toBeInTheDocument();
  });

  it("TEACHER: no assign/add/remove controls render", async () => {
    renderPage("TEACHER");

    await screen.findByText("JSS 1 A");
    expect(
      screen.queryByRole("button", { name: /Change|Assign/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add subject teacher/ }),
    ).not.toBeInTheDocument();
  });

  // SPEC_V0.5.1.md §2.4/v0.5.1 step 2: a teacher opening a class they don't
  // teach now gets a 403 from the backend — the page's existing generic
  // error branch (used for every other failed load in this app) already
  // surfaces it as a readable sentence, not a crash or blank page.
  it("TEACHER: a class they don't teach shows the backend's 403 message, not a crash", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me"))
        return { ...SCHOOL_ADMIN_USER, role: "TEACHER" };
      if (path.includes("/class-arms/arm-1")) {
        const { ApiError } = await import("../../lib/api-client");
        throw new ApiError(403, {
          statusCode: 403,
          message: "You are not assigned to this class.",
          error: "Forbidden",
          path: "/api/v1/class-arms/arm-1",
          timestamp: new Date().toISOString(),
        });
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(
      <Routes>
        <Route path="/classes/arms/:id" element={<ClassArmDetailPage />} />
      </Routes>,
      { route: "/classes/arms/arm-1" },
    );

    expect(
      await screen.findByText("You are not assigned to this class."),
    ).toBeInTheDocument();
  });
});
