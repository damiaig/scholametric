import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import type { AssessmentComponent, MyTeaching } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ScoreEntryGridPage } from "./ScoreEntryGridPage";

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
  classTeacherOf: [],
  subjects: [
    { id: "sa1", subjectId: "sub1", subjectName: "Mathematics", classArmId: "arm1", className: "JSS 1 A" },
    { id: "sa2", subjectId: "sub2", subjectName: "English Language", classArmId: "arm2", className: "JSS 2 A" },
  ],
  currentSessionId: "sess1",
  currentTermId: "term1",
  currentTermName: "FIRST",
};

const COMPONENTS: AssessmentComponent[] = [
  { id: "c1", schoolId: "s1", name: "CA 1", weight: 20, sortOrder: 1, requiresApproval: false, deletedAt: null, createdAt: "t", updatedAt: "t" },
];

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("ScoreEntryGridPage — teacher scoping", () => {
  it("TEACHER's picker only offers their own assigned class+subject pairs, and never calls admin-only session/term endpoints", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/auth/me") return TEACHER_USER;
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/assessment-components") return COMPONENTS;
      if (path === "/api/v1/sessions" || path === "/api/v1/terms") {
        throw new Error(`${path} should never be called for a TEACHER`);
      }
      // useClasses()/useAllSubjects() are legitimately teacher-readable but
      // unused in the rendered UI for this role — resolve harmlessly.
      if (path === "/api/v1/classes") return [];
      if (path === "/api/v1/subjects") return { items: [], total: 0, page: 1, pageSize: 100 };
      throw new Error(`unexpected call: ${path}`);
    });

    renderWithProviders(<ScoreEntryGridPage />);

    const select = await screen.findByLabelText("Class & subject");
    const options = within(select).getAllByRole("option").filter((o) => (o as HTMLOptionElement).value !== "");
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.textContent)).toEqual([
      "Mathematics — JSS 1 A",
      "English Language — JSS 2 A",
    ]);

    // The term picker shows the fixed current term as text, not a dropdown.
    expect(screen.getByText("First term")).toBeInTheDocument();
    expect(screen.queryByLabelText("Term")).not.toBeInTheDocument();

    expect(mockedApiRequest).not.toHaveBeenCalledWith("/api/v1/sessions", expect.anything());
    expect(mockedApiRequest).not.toHaveBeenCalledWith("/api/v1/terms", expect.anything());
  });
});
