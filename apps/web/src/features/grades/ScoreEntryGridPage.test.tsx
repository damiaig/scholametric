import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssessmentComponent, ClassArmDetail, ClassLevelOverview, MyTeaching, Paginated, Term, AcademicSession } from "@scholametric/shared";
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

const CLASSES: ClassLevelOverview[] = [
  {
    id: "lvl1",
    name: "JSS 1",
    rank: 1,
    arms: [
      { id: "arm1", name: "A", enrollmentCount: 20, classTeacher: null },
      { id: "arm2", name: "B", enrollmentCount: 18, classTeacher: null },
    ],
  },
];

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

// arm1 has one subject with a teacher assigned; arm2 (SPEC_V0.5.1.md
// §2.1/§2.2) has none — no subject_teacher_assignment exists there yet.
const ARM1_DETAIL: ClassArmDetail = {
  id: "arm1",
  name: "A",
  classLevel: { id: "lvl1", name: "JSS 1", rank: 1 },
  classTeacher: null,
  subjectTeachers: [
    { id: "sta1", subjectId: "sub1", subjectName: "Mathematics", teacherUserId: "t1", teacherFirstName: "Bola", teacherLastName: "Ogundare" },
  ],
  students: { items: [], total: 0, page: 1, pageSize: 1 },
};
const ARM2_DETAIL: ClassArmDetail = {
  id: "arm2",
  name: "B",
  classLevel: { id: "lvl1", name: "JSS 1", rank: 1 },
  classTeacher: null,
  subjectTeachers: [],
  students: { items: [], total: 0, page: 1, pageSize: 1 },
};

function mockAdminCommon() {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path === "/api/v1/auth/me") return ADMIN_USER;
    if (path === "/api/v1/classes") return CLASSES;
    if (path === "/api/v1/assessment-components") return COMPONENTS;
    if (path === "/api/v1/sessions") return SESSIONS;
    if (path === "/api/v1/terms") return TERMS;
    if (path === "/api/v1/class-arms/arm1") return ARM1_DETAIL;
    if (path === "/api/v1/class-arms/arm2") return ARM2_DETAIL;
    throw new Error(`unexpected call: ${path}`);
  });
}

// SPEC_V0.5.1.md §2.1/§2.2 — the free unfiltered subject dropdown
// (GET /subjects) is the exact bug this step closes: an admin could pick
// any subject in the school for any class, whether or not a teacher was
// assigned there. These tests prove the replacement (class-arm-scoped
// subjectTeachers) is what actually renders, and that GET /subjects is
// never called for this picker at all.
// The class select itself starts disabled (useClasses() hasn't resolved on
// first render) — waiting for it to become enabled before selecting avoids
// a race against the mocked query settling.
async function selectClassArm(user: ReturnType<typeof userEvent.setup>, value: string) {
  const classSelect = (await screen.findByLabelText("Class")) as HTMLSelectElement;
  await waitFor(() => expect(classSelect).not.toBeDisabled());
  await user.selectOptions(classSelect, value);
}

describe("ScoreEntryGridPage — admin subject picker scoped by teacher assignment", () => {
  it("subject dropdown is empty/disabled until a class is picked, then offers only that class's teacher-assigned subjects", async () => {
    mockAdminCommon();
    const user = userEvent.setup();
    renderWithProviders(<ScoreEntryGridPage />);

    const subjectSelect = (await screen.findByLabelText("Subject")) as HTMLSelectElement;
    expect(subjectSelect).toBeDisabled();

    await selectClassArm(user, "arm1");

    await waitFor(() => expect(subjectSelect).not.toBeDisabled());
    const options = within(subjectSelect).getAllByRole("option").filter((o) => (o as HTMLOptionElement).value !== "");
    expect(options.map((o) => o.textContent)).toEqual(["Mathematics"]);

    expect(mockedApiRequest).not.toHaveBeenCalledWith("/api/v1/subjects", expect.anything());
  });

  it("a class with no teacher-assigned subjects shows a message instead of a pickable dropdown", async () => {
    mockAdminCommon();
    const user = userEvent.setup();
    renderWithProviders(<ScoreEntryGridPage />);

    await selectClassArm(user, "arm2");

    expect(await screen.findByText("No subjects have a teacher assigned for this class yet.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Subject")).not.toBeInTheDocument();
  });

  it("switching classes clears a previously-picked subject that may not apply to the new class", async () => {
    mockAdminCommon();
    const user = userEvent.setup();
    renderWithProviders(<ScoreEntryGridPage />);

    await selectClassArm(user, "arm1");
    const subjectSelect = (await screen.findByLabelText("Subject")) as HTMLSelectElement;
    await waitFor(() => expect(subjectSelect).not.toBeDisabled());
    await user.selectOptions(subjectSelect, "sub1");
    expect(subjectSelect.value).toBe("sub1");

    await selectClassArm(user, "arm2");
    expect(await screen.findByText("No subjects have a teacher assigned for this class yet.")).toBeInTheDocument();

    await user.selectOptions(await screen.findByLabelText("Class"), "arm1");
    const subjectSelectAgain = (await screen.findByLabelText("Subject")) as HTMLSelectElement;
    await waitFor(() => expect(subjectSelectAgain).not.toBeDisabled());
    expect(subjectSelectAgain.value).toBe("");
  });
});
