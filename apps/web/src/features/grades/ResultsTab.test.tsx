import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassArmResultsResponse, MyTeaching } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ResultsTab } from "./ResultsTab";

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

const ADMIN_USER = { ...TEACHER_USER, id: "u1", email: "admin@sunrise.test", role: "SCHOOL_ADMIN" };

// This teacher teaches Mathematics (sub1) in arm1, but NOT English (sub2)
// — English shows up in RESULTS below because a class teacher sees every
// subject in their class, not just their own (backend behavior, already
// proven server-side; this fixture simulates exactly that shape).
const TEACHING: MyTeaching = {
  classTeacherOf: [{ classArmId: "arm1", className: "JSS 1 A", sessionId: "sess1", sessionName: "2026/2027", enrollmentCount: 30 }],
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
      needsTeacherAssignment: false,
      averageScore: 56,
      averageGrade: "C5",
      results: [{ id: "tsr1", studentId: "s1", totalScore: 56, autoGrade: "C5", overrideGrade: null, finalGrade: "C5", subjectPosition: null, status: "DRAFT" }],
    },
    {
      subjectId: "sub2",
      subjectName: "English Language",
      needsTeacherAssignment: false,
      averageScore: 70,
      averageGrade: "B2",
      results: [{ id: "tsr2", studentId: "s1", totalScore: 70, autoGrade: "B2", overrideGrade: null, finalGrade: "B2", subjectPosition: 1, status: "PUBLISHED" }],
    },
  ],
  overall: null,
};

function mockApi(role: "TEACHER" | "SCHOOL_ADMIN") {
  mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
    const method = opts?.method ?? "GET";
    if (path === "/api/v1/auth/me") return role === "TEACHER" ? TEACHER_USER : ADMIN_USER;
    if (path === "/api/v1/me/teaching") return TEACHING;
    if (path === "/api/v1/class-arms/arm1/results") return RESULTS;
    if (path === "/api/v1/sessions") {
      return { items: [{ id: "sess1", schoolId: "s1", name: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-07-31", isCurrent: true, createdAt: "t", updatedAt: "t" }], total: 1, page: 1, pageSize: 50 };
    }
    if (path === "/api/v1/terms") {
      return { items: [{ id: "term1", schoolId: "s1", sessionId: "sess1", name: "FIRST", startsOn: "2026-09-01", endsOn: "2026-12-12", isCurrent: true, closedAt: null, closedBy: null, createdAt: "t", updatedAt: "t" }], total: 1, page: 1, pageSize: 20 };
    }
    if (path === "/api/v1/grades/publish" && method === "POST") return { classArmId: "arm1", subjectId: "sub1", termId: "term1", publishedCount: 1, subjectPositions: [], overallPublishedCount: 0 };
    if (path === "/api/v1/grades/unpublish" && method === "POST") return { classArmId: "arm1", subjectId: "sub2", termId: "term1", unpublishedCount: 1, overallRevertedCount: 0 };
    throw new Error(`unexpected apiRequest call: ${method} ${path}`);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

// v0.7.3 step 1 (SPEC_V0.7.3.md §2) — the teacher-owned publish/unpublish
// control on the Grades page's Results tab.
describe("ResultsTab — publish/unpublish (v0.7.3 step 1)", () => {
  it("TEACHER: Publish/Unpublish appear on Mathematics (their own subject) but not on English (a class-teacher-visible colleague's subject)", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi("TEACHER");

    renderWithProviders(<ResultsTab classArmId="arm1" armLabel="JSS 1 A" />);

    // "Mathematics"/"English Language" each render 3x (summary card,
    // mobile card, desktop table) — jsdom has no real breakpoint, so both
    // mobile and desktop copies exist in the DOM at once.
    await screen.findAllByText("Mathematics");
    expect(screen.getByLabelText("Publish Mathematics")).toBeInTheDocument();
    expect(screen.queryByLabelText("Unpublish Mathematics")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Publish English Language")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Unpublish English Language")).not.toBeInTheDocument();
  });

  it("SCHOOL_ADMIN: no Publish/Unpublish buttons anywhere on this tab (SPEC_V0.7.3.md §2 Q6 — admin uses the separate Review & Publish page)", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi("SCHOOL_ADMIN");

    renderWithProviders(<ResultsTab classArmId="arm1" armLabel="JSS 1 A" />);

    await screen.findAllByText("Mathematics");
    await screen.findAllByText("English Language");
    expect(screen.queryByLabelText(/Publish|Unpublish/)).not.toBeInTheDocument();
  });

  it("clicking Publish opens the confirm dialog naming the class/subject/term; confirming calls POST /grades/publish", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockApi("TEACHER");
    const user = userEvent.setup();

    renderWithProviders(<ResultsTab classArmId="arm1" armLabel="JSS 1 A" />);

    await screen.findAllByText("Mathematics");
    await user.click(screen.getByLabelText("Publish Mathematics"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/This publishes JSS 1 A Mathematics First term results/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(mockedApiRequest).toHaveBeenCalledWith(
        "/api/v1/grades/publish",
        expect.objectContaining({ method: "POST", body: { classArmId: "arm1", subjectId: "sub1", termId: "term1" } }),
      ),
    );
  });

  it("clicking Unpublish on the already-published subject opens the cascade-warning dialog; confirming calls POST /grades/unpublish", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    // This teacher also teaches English (sub2) in this render, so the
    // Unpublish control (published already) is theirs to use too.
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      const method = opts?.method ?? "GET";
      if (path === "/api/v1/auth/me") return TEACHER_USER;
      if (path === "/api/v1/me/teaching") {
        return { ...TEACHING, subjects: [...TEACHING.subjects, { id: "sa2", subjectId: "sub2", subjectName: "English Language", classArmId: "arm1", className: "JSS 1 A" }] };
      }
      if (path === "/api/v1/class-arms/arm1/results") return RESULTS;
      if (path === "/api/v1/grades/unpublish" && method === "POST") return { classArmId: "arm1", subjectId: "sub2", termId: "term1", unpublishedCount: 1, overallRevertedCount: 0 };
      throw new Error(`unexpected apiRequest call: ${method} ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<ResultsTab classArmId="arm1" armLabel="JSS 1 A" />);

    await screen.findAllByText("English Language");
    await user.click(screen.getByLabelText("Unpublish English Language"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/recomputes overall positions for the whole class/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Unpublish" }));

    await waitFor(() =>
      expect(mockedApiRequest).toHaveBeenCalledWith(
        "/api/v1/grades/unpublish",
        expect.objectContaining({ method: "POST", body: { classArmId: "arm1", subjectId: "sub2", termId: "term1" } }),
      ),
    );
  });
});
