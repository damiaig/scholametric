import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import type { MyTeaching, ClassArmResultsResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { GradesOverviewPage } from "./GradesOverviewPage";

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
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

const TEACHING: MyTeaching = {
  classTeacherOf: [{ classArmId: "arm2", className: "JSS 2 A", sessionId: "sess1", sessionName: "2026/2027", enrollmentCount: 30 }],
  subjects: [{ id: "sa1", subjectId: "sub1", subjectName: "Mathematics", classArmId: "arm1", className: "JSS 1 A" }],
  currentSessionId: "sess1",
  currentTermId: "term1",
  currentTermName: "FIRST",
};

const RESULTS: ClassArmResultsResponse = {
  classArmId: "arm1",
  termId: "term1",
  students: [{ studentId: "s1", firstName: "Ada", lastName: "Bello", admissionNumber: "SUN/0001" }],
  subjects: [
    {
      subjectId: "sub1",
      subjectName: "Mathematics",
      averageScore: 56,
      averageGrade: "C5",
      results: [{ id: "tsr1", studentId: "s1", totalScore: 56, autoGrade: "C5", overrideGrade: null, finalGrade: "C5", subjectPosition: null, status: "PENDING_APPROVAL" }],
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

describe("GradesOverviewPage — teacher scoping", () => {
  it("TEACHER's class picker offers exactly their assigned+class-taught arms (deduped), and never calls admin-only session/term endpoints", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/auth/me") return TEACHER_USER;
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/sessions" || path === "/api/v1/terms") {
        throw new Error(`${path} should never be called for a TEACHER`);
      }
      if (path === "/api/v1/classes") return [];
      throw new Error(`unexpected call: ${path}`);
    });

    renderWithProviders(<GradesOverviewPage />);

    const select = await screen.findByLabelText("Class");
    const options = within(select).getAllByRole("option").filter((o) => (o as HTMLOptionElement).value !== "");
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.textContent)).toEqual(["JSS 2 A", "JSS 1 A"]);
    expect(screen.getByText("First term")).toBeInTheDocument();

    expect(mockedApiRequest).not.toHaveBeenCalledWith("/api/v1/sessions", expect.anything());
    expect(mockedApiRequest).not.toHaveBeenCalledWith("/api/v1/terms", expect.anything());
  });

  it("loads and renders results once a class is selected via URL params", async () => {
    mockedApiRequest.mockImplementation(async (path, options) => {
      if (path === "/api/v1/auth/me") return TEACHER_USER;
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/classes") return [];
      if (path === "/api/v1/class-arms/arm1/results") {
        expect((options as { query?: Record<string, string> })?.query?.termId).toBe("term1");
        return RESULTS;
      }
      throw new Error(`unexpected call: ${path}`);
    });

    renderWithProviders(<GradesOverviewPage />, { route: "/grades/overview?classArmId=arm1" });

    await screen.findAllByText("Mathematics");
    expect(screen.getAllByText("C5").length).toBeGreaterThan(0);
    // subjectPosition is null (PENDING_APPROVAL) — must render as "Not yet
    // ranked", never blank or a stray 0.
    expect(screen.getAllByText(/Not yet ranked/).length).toBeGreaterThan(0);
  });
});
