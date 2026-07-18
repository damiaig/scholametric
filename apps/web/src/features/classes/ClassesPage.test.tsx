import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassLevelOverview, Paginated, SubjectWithLevels } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ClassesPage } from "./ClassesPage";

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

const CLASSES: ClassLevelOverview[] = [
  {
    id: "lvl-1",
    name: "JSS 1",
    rank: 1,
    arms: [
      { id: "arm-1", name: "A", enrollmentCount: 25, classTeacher: { userId: "t-1", firstName: "Bola", lastName: "Ogundare" } },
      { id: "arm-2", name: "B", enrollmentCount: 20, classTeacher: null },
    ],
  },
  { id: "lvl-2", name: "JSS 2", rank: 2, arms: [] },
];

const SUBJECTS: SubjectWithLevels[] = [
  {
    id: "subj-1",
    schoolId: "s1",
    name: "Mathematics",
    code: "MTH",
    createdAt: "",
    updatedAt: "",
    classLevels: [{ id: "lvl-1", name: "JSS 1", rank: 1 }],
  },
];

function mockApi(role: string = "SCHOOL_ADMIN") {
  mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
    if (path.includes("/auth/me")) return { ...SCHOOL_ADMIN_USER, role };
    if (path === "/api/v1/classes") return CLASSES;
    if (path === "/api/v1/subjects" && (!opts?.method || opts.method === "GET")) {
      return { items: SUBJECTS, total: SUBJECTS.length, page: 1, pageSize: 20 } satisfies Paginated<SubjectWithLevels>;
    }
    throw new Error(`unexpected apiRequest call: ${path} ${opts?.method ?? "GET"}`);
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

describe("ClassesPage — Classes tab", () => {
  it("renders levels ordered with arm chips, enrollment counts, and class-teacher initials", async () => {
    mockApi();
    renderWithProviders(<ClassesPage />);

    expect(await screen.findByText("JSS 1")).toBeInTheDocument();
    expect(screen.getByText("JSS 1 A")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("JSS 1 B")).toBeInTheDocument();
    expect(screen.getByText("No teacher")).toBeInTheDocument();
    expect(screen.getByText("JSS 2")).toBeInTheDocument();
    expect(screen.getByText("No arms yet for this level.")).toBeInTheDocument();
  });

  it("Add arm dialog suggests the next letter (has A and B -> suggests C)", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<ClassesPage />);
    await screen.findByText("JSS 1");

    const jss1Card = screen.getByText("JSS 1").closest("div.rounded-lg")!;
    await user.click(within(jss1Card as HTMLElement).getByRole("button", { name: /Add arm/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("C");
  });

  it("TEACHER sees no Add level / Add arm controls", async () => {
    mockApi("TEACHER");
    renderWithProviders(<ClassesPage />);

    await screen.findByText("JSS 1");
    expect(screen.queryByRole("button", { name: /Add level/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add arm/ })).not.toBeInTheDocument();
  });
});

describe("ClassesPage — Subjects tab", () => {
  it("renders subjects with level chips, and surfaces the assigned-delete 409 as a friendly sentence", async () => {
    mockApi();
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path.includes("/auth/me")) return SCHOOL_ADMIN_USER;
      if (path === "/api/v1/classes") return CLASSES;
      if (path === "/api/v1/subjects" && (!opts?.method || opts.method === "GET")) {
        return { items: SUBJECTS, total: SUBJECTS.length, page: 1, pageSize: 20 };
      }
      if (path === "/api/v1/subjects/subj-1" && opts?.method === "DELETE") {
        const { ApiError } = await import("../../lib/api-client");
        throw new ApiError(409, {
          statusCode: 409,
          message: "This subject has teacher assignments and cannot be deleted.",
          error: "Conflict",
          path: "/api/v1/subjects/subj-1",
          timestamp: new Date().toISOString(),
        });
      }
      throw new Error(`unexpected apiRequest call: ${path} ${opts?.method ?? "GET"}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<ClassesPage />);
    await screen.findByText("JSS 1");

    await user.click(screen.getByRole("tab", { name: "Subjects" }));
    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Mathematics")).toBeInTheDocument();
    expect(table.getByText("MTH")).toBeInTheDocument();
    expect(table.getByText("JSS 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Mathematics" }));
    const confirmDialog = within(await screen.findByRole("dialog"));
    await user.click(confirmDialog.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText("This subject has teacher assignments and cannot be deleted."),
    ).toBeInTheDocument();
  });

  it("TEACHER sees no subject mutation controls", async () => {
    mockApi("TEACHER");
    const user = userEvent.setup();
    renderWithProviders(<ClassesPage />);
    await screen.findByText("JSS 1");

    await user.click(screen.getByRole("tab", { name: "Subjects" }));
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: /New subject/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete Mathematics/ })).not.toBeInTheDocument();
  });
});
