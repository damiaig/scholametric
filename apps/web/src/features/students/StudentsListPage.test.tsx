import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Paginated, Student } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { StudentsListPage } from "./StudentsListPage";

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
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE" },
};

const TEACHER_USER = { ...SCHOOL_ADMIN_USER, role: "TEACHER" };

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: "st-1",
    schoolId: "s1",
    admissionNumber: "SUN/2026/0001",
    firstName: "Oluwaseun",
    lastName: "Adeyemi",
    middleName: null,
    gender: "MALE",
    dateOfBirth: "2012-05-01T00:00:00.000Z",
    admittedOn: "2026-09-01T00:00:00.000Z",
    status: "ACTIVE",
    guardianName: "Guardian",
    guardianPhone: "+2348012345678",
    guardianEmail: null,
    address: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    currentEnrollment: {
      id: "e1",
      classArmId: "arm-1",
      sessionId: "sess-1",
      enrolledOn: "2026-09-01T00:00:00.000Z",
      classArm: { id: "arm-1", name: "A", classLevel: { id: "lvl-1", name: "JSS 2", rank: 2 } },
      session: { id: "sess-1", name: "2026/2027", isCurrent: true },
    },
    ...overrides,
  };
}

function paginated(items: Student[], total = items.length, page = 1, pageSize = 20): Paginated<Student> {
  return { items, total, page, pageSize };
}

function mockApi(options: { role?: string; studentsHandler?: (query: Record<string, unknown>) => Paginated<Student> } = {}) {
  const role = options.role ?? "SCHOOL_ADMIN";
  mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, unknown> }) => {
    if (path.includes("/auth/me")) {
      return role === "TEACHER" ? TEACHER_USER : SCHOOL_ADMIN_USER;
    }
    if (path.includes("/class-levels")) {
      return { items: [{ id: "lvl-1", schoolId: "s1", name: "JSS 2", rank: 2 }], total: 1, page: 1, pageSize: 100 };
    }
    if (path.includes("/class-arms")) {
      if (role === "TEACHER") {
        throw new Error("403");
      }
      return { items: [{ id: "arm-1", schoolId: "s1", classLevelId: "lvl-1", name: "A" }], total: 1, page: 1, pageSize: 100 };
    }
    if (path.includes("/students")) {
      const query = opts?.query ?? {};
      if (options.studentsHandler) {
        return options.studentsHandler(query);
      }
      return paginated([student()]);
    }
    throw new Error(`unexpected apiRequest call: ${path}`);
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

// jsdom doesn't apply real media queries, so DataTable's desktop <table> and
// mobile-card <div> both render in tests (only CSS hides one) — every row's
// text exists twice. Scope row assertions to the table to avoid ambiguity.
async function findTable() {
  return screen.findByRole("table");
}

describe("StudentsListPage", () => {
  it("renders rows from mocked data", async () => {
    mockApi();
    renderWithProviders(<StudentsListPage />);

    const table = within(await findTable());
    expect(table.getByText("Oluwaseun Adeyemi")).toBeInTheDocument();
    expect(table.getByText("SUN/2026/0001")).toBeInTheDocument();
  });

  it("shows the empty state when there are zero results", async () => {
    mockApi({ studentsHandler: () => paginated([], 0) });
    renderWithProviders(<StudentsListPage />);

    expect(await screen.findByText(/No students found/)).toBeInTheDocument();
  });

  it("pagination controls request the right page", async () => {
    const seenPages: number[] = [];
    mockApi({
      studentsHandler: (query) => {
        const page = Number(query.page ?? 1);
        seenPages.push(page);
        return paginated([student({ id: `st-${page}`, firstName: `Page${page}` })], 40, page, 20);
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<StudentsListPage />);

    expect(within(await findTable()).getByText("Page1 Adeyemi")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => {
      expect(within(screen.getByRole("table")).getByText("Page2 Adeyemi")).toBeInTheDocument();
    });
    expect(seenPages).toContain(2);
  });

  it("debounces the search input before passing the search param", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<StudentsListPage />);
    await findTable();

    await user.type(screen.getByLabelText("Search students"), "Oluwa");

    await waitFor(() => {
      const searchCall = mockedApiRequest.mock.calls.find(
        ([path, opts]) =>
          typeof path === "string" &&
          path.includes("/students") &&
          !path.includes("class") &&
          (opts as { query?: Record<string, unknown> } | undefined)?.query?.search === "Oluwa",
      );
      expect(searchCall).toBeDefined();
    });
  });

  it("TEACHER: the New student button is absent", async () => {
    mockApi({ role: "TEACHER" });
    renderWithProviders(<StudentsListPage />);

    await findTable();
    expect(screen.queryByRole("button", { name: /New student/ })).not.toBeInTheDocument();
  });
});
