import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { MyTeaching } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { TeacherGradesPage } from "./TeacherGradesPage";

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

function mockCommon(teaching: unknown = TEACHING) {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return USER;
    if (path.includes("/me/teaching")) return teaching;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

// v0.7.2 — the pick-a-class Grades landing page reached from the new
// sidebar item. Thin picker only: same useMyTeaching() data MyClassesView
// already fetches, same /classes/arms/:id/grades route Step 1 already
// built. This test suite proves it composes that existing data/route
// correctly, not new behavior.
describe("TeacherGradesPage", () => {
  it("renders 'Classes I teach' cards linking straight into that class's Results tab", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockCommon();

    renderWithProviders(<TeacherGradesPage />);

    const classCard = await screen.findByRole("link", { name: /SSS 2 A/ });
    expect(classCard).toHaveAttribute(
      "href",
      "/classes/arms/arm1/grades?tab=results",
    );
    expect(screen.getByText("30 students")).toBeInTheDocument();
  });

  it("renders 'Subjects I teach' rows: class link goes to Results, action links go to Enter-scores for the right subject/track", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockCommon();

    renderWithProviders(<TeacherGradesPage />);

    await screen.findByText("Mathematics");
    expect(screen.getByRole("link", { name: "JSS 1 A" })).toHaveAttribute(
      "href",
      "/classes/arms/arm2/grades?tab=results",
    );
    expect(screen.getByRole("link", { name: "Enter grades" })).toHaveAttribute(
      "href",
      "/classes/arms/arm2/grades?tab=enter&subjectId=sub1&track=evaluations",
    );
    expect(
      screen.getByRole("link", { name: "Enter exam scores" }),
    ).toHaveAttribute(
      "href",
      "/classes/arms/arm2/grades?tab=enter&subjectId=sub1&track=exams",
    );
  });

  it("no assignments: shows the same empty state MyClassesView uses, not an error", async () => {
    authStore.setTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mockCommon({
      classTeacherOf: [],
      subjects: [],
      currentSessionId: null,
      currentTermId: null,
      currentTermName: null,
    });

    renderWithProviders(<TeacherGradesPage />);

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
      if (path.includes("/auth/me")) return USER;
      if (path.includes("/me/teaching")) throw new Error("boom");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TeacherGradesPage />);

    expect(
      await screen.findByText("Couldn't load your teaching load."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
