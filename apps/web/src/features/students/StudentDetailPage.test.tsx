import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { AuditLogEntry, Paginated, StudentDetail, StudentGuardianSummary } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { ApiError, apiRequest } from "../../lib/api-client";
import { StudentDetailPage } from "./StudentDetailPage";

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

const STUDENT: StudentDetail = {
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
  guardians: [],
};

function guardian(overrides: Partial<StudentGuardianSummary> = {}): StudentGuardianSummary {
  return {
    id: "link-1",
    guardianId: "g1",
    relationship: "FATHER",
    isPrimary: true,
    firstName: "Tunde",
    lastName: "Adeyemi",
    phone: "+2348011112222",
    email: null,
    address: null,
    ...overrides,
  };
}

interface MockOptions {
  role?: string;
  guardians?: StudentGuardianSummary[];
  auditLogs?: AuditLogEntry[];
  handlers?: Record<string, (opts?: { method?: string; body?: unknown; query?: Record<string, unknown> }) => unknown>;
}

function mockApi(options: MockOptions = {}) {
  const role = options.role ?? "SCHOOL_ADMIN";
  let guardians = options.guardians ?? [guardian()];

  mockedApiRequest.mockImplementation(
    async (path: string, opts?: { method?: string; body?: unknown; query?: Record<string, unknown> }) => {
      if (path.includes("/auth/me")) return role === "TEACHER" ? TEACHER_USER : SCHOOL_ADMIN_USER;
      if (path.includes("/class-levels")) {
        return { items: [{ id: "lvl-1", schoolId: "s1", name: "JSS 2", rank: 2 }], total: 1, page: 1, pageSize: 100 };
      }
      if (path.includes("/class-arms")) {
        return { items: [{ id: "arm-1", schoolId: "s1", classLevelId: "lvl-1", name: "A" }], total: 1, page: 1, pageSize: 100 };
      }
      if (path === "/api/v1/students/st-1") return STUDENT;
      if (path === "/api/v1/students/st-1/guardians" && (!opts?.method || opts.method === "GET")) {
        return guardians;
      }
      if (path === "/api/v1/audit-logs") {
        const items = options.auditLogs ?? [];
        return { items, total: items.length, page: 1, pageSize: 10 } satisfies Paginated<AuditLogEntry>;
      }
      const handlerKey = `${path}::${opts?.method ?? "GET"}`;
      if (options.handlers?.[handlerKey]) {
        return options.handlers[handlerKey](opts);
      }
      // Allow tests to mutate the guardians list via a custom handler that
      // also updates the shared `guardians` closure variable.
      if (path === "/api/v1/students/st-1/guardians" && opts?.method === "POST") {
        const created = guardian({ id: `link-${guardians.length + 1}`, guardianId: `g${guardians.length + 1}`, isPrimary: false, ...(opts.body as object) });
        guardians = [...guardians, created];
        return created;
      }
      throw new Error(`unexpected apiRequest call: ${path} ${opts?.method ?? "GET"}`);
    },
  );

  return {
    getGuardians: () => guardians,
    setGuardians: (next: StudentGuardianSummary[]) => {
      guardians = next;
    },
  };
}

function renderDetailPage() {
  return renderWithProviders(<Routes><Route path="/students/:id" element={<StudentDetailPage />} /></Routes>, {
    route: "/students/st-1",
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

describe("StudentDetailPage — RBAC", () => {
  it("TEACHER: Edit/Transfer/Withdraw buttons are absent, and the History tab does not render", async () => {
    mockApi({ role: "TEACHER" });
    renderDetailPage();

    expect(await screen.findByText("Oluwaseun Adeyemi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Transfer class/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Withdraw/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "History" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add guardian" })).not.toBeInTheDocument();
  });

  it("SCHOOL_ADMIN: withdraw confirm button stays disabled until the surname is typed exactly", async () => {
    mockApi();
    const user = userEvent.setup();
    renderDetailPage();

    await screen.findByText("Oluwaseun Adeyemi");
    await user.click(screen.getByRole("button", { name: /Withdraw/ }));

    await screen.findByRole("dialog", { name: "Withdraw student" });
    const confirm = () => screen.getAllByRole("button", { name: "Withdraw" }).slice(-1)[0];

    await user.type(screen.getByLabelText("Reason"), "Relocated");
    expect(confirm()).toBeDisabled();

    const typedConfirmInput = screen.getByLabelText(/Type/);
    await user.type(typedConfirmInput, "Wrong");
    expect(confirm()).toBeDisabled();

    await user.clear(typedConfirmInput);
    await user.type(typedConfirmInput, STUDENT.lastName);
    expect(confirm()).not.toBeDisabled();
  });
});

describe("StudentDetailPage — Guardians section", () => {
  it("renders guardians with the primary badge", async () => {
    mockApi({ guardians: [guardian(), guardian({ id: "link-2", guardianId: "g2", isPrimary: false, firstName: "Bisi" })] });
    renderDetailPage();

    await screen.findByText("Oluwaseun Adeyemi");
    expect(await screen.findByText("Tunde Adeyemi")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Bisi Adeyemi")).toBeInTheDocument();
  });

  it("adds a new guardian (create-new mode)", async () => {
    const api = mockApi({ guardians: [guardian()] });
    const user = userEvent.setup();
    renderDetailPage();

    await screen.findByText("Tunde Adeyemi");
    await user.click(screen.getByRole("button", { name: "Add guardian" }));

    const dialog = await screen.findByRole("dialog", { name: "Add guardian" });
    await user.type(within(dialog).getByLabelText("First name"), "Bisi");
    await user.type(within(dialog).getByLabelText("Last name"), "Adeyemi");
    await user.type(within(dialog).getByLabelText("Phone"), "+2348099998888");
    await user.selectOptions(within(dialog).getByLabelText("Relationship to student"), "MOTHER");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockedApiRequest).toHaveBeenCalledWith(
        "/api/v1/students/st-1/guardians",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({ firstName: "Bisi", lastName: "Adeyemi", relationship: "MOTHER" }),
        }),
      );
    });
    expect(api.getGuardians().some((g) => g.firstName === "Bisi")).toBe(true);
  });

  it("adds a guardian by linking an existing sibling's guardian", async () => {
    mockApi({ guardians: [guardian()] });
    const user = userEvent.setup();

    mockedApiRequest.mockImplementation(
      async (path: string, opts?: { method?: string; body?: unknown; query?: Record<string, unknown> }) => {
        if (path.includes("/auth/me")) return SCHOOL_ADMIN_USER;
        if (path === "/api/v1/students/st-1") return STUDENT;
        if (path === "/api/v1/students/st-1/guardians" && (!opts?.method || opts.method === "GET")) {
          return [guardian()];
        }
        if (path === "/api/v1/students" && opts?.query?.search) {
          return { items: [{ id: "st-2", firstName: "Chiamaka", lastName: "Okafor", admissionNumber: "SUN/2026/0002" }], total: 1, page: 1, pageSize: 20 };
        }
        if (path === "/api/v1/students/st-2/guardians") {
          return [guardian({ id: "link-99", guardianId: "g-existing", firstName: "Amaka", lastName: "Okafor", isPrimary: true })];
        }
        if (path === "/api/v1/students/st-1/guardians" && opts?.method === "POST") {
          return guardian({ id: "link-2", guardianId: "g-existing", firstName: "Amaka", lastName: "Okafor", isPrimary: false });
        }
        throw new Error(`unexpected apiRequest call: ${path} ${opts?.method ?? "GET"}`);
      },
    );

    renderDetailPage();
    await screen.findByText("Tunde Adeyemi");
    await user.click(screen.getByRole("button", { name: "Add guardian" }));

    const dialog = await screen.findByRole("dialog", { name: "Add guardian" });
    await user.click(within(dialog).getByRole("button", { name: "Link existing (sibling)" }));
    await user.type(within(dialog).getByLabelText("Find the sibling"), "Chiamaka");

    await user.click(await within(dialog).findByText("Chiamaka Okafor"));
    await user.click(await within(dialog).findByText("Amaka Okafor"));
    await user.selectOptions(within(dialog).getByLabelText("Relationship to student"), "AUNT");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockedApiRequest).toHaveBeenCalledWith(
        "/api/v1/students/st-1/guardians",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({ guardianId: "g-existing", relationship: "AUNT" }),
        }),
      );
    });
  });

  it("sets a non-primary guardian as primary", async () => {
    mockApi({ guardians: [guardian(), guardian({ id: "link-2", guardianId: "g2", isPrimary: false, firstName: "Bisi" })] });
    const user = userEvent.setup();
    renderDetailPage();

    await screen.findByText("Bisi Adeyemi");
    await user.click(screen.getByRole("button", { name: "Make Bisi Adeyemi primary" }));

    await waitFor(() => {
      expect(mockedApiRequest).toHaveBeenCalledWith(
        "/api/v1/students/st-1/guardians/g2/primary",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("unlinking the primary guardian when another exists shows the reassign-first message inline", async () => {
    mockApi({ guardians: [guardian(), guardian({ id: "link-2", guardianId: "g2", isPrimary: false, firstName: "Bisi" })] });
    const user = userEvent.setup();

    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; query?: Record<string, unknown> }) => {
      if (path.includes("/auth/me")) return SCHOOL_ADMIN_USER;
      if (path === "/api/v1/students/st-1") return STUDENT;
      if (path === "/api/v1/students/st-1/guardians" && (!opts?.method || opts.method === "GET")) {
        return [guardian(), guardian({ id: "link-2", guardianId: "g2", isPrimary: false, firstName: "Bisi" })];
      }
      if (path === "/api/v1/students/st-1/guardians/g1" && opts?.method === "DELETE") {
        throw new ApiError(409, {
          statusCode: 409,
          message: "Make another guardian primary first.",
          error: "Conflict",
          path,
          timestamp: new Date().toISOString(),
        });
      }
      throw new Error(`unexpected apiRequest call: ${path} ${opts?.method ?? "GET"}`);
    });

    renderDetailPage();
    await screen.findByText("Tunde Adeyemi");
    await user.click(screen.getByRole("button", { name: "Remove Tunde Adeyemi" }));

    const dialog = await screen.findByRole("dialog", { name: "Remove guardian" });
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(await within(dialog).findByText("Make another guardian primary first.")).toBeInTheDocument();
  });

  it("unlinking the only guardian escalates to a typed force-confirm dialog", async () => {
    const user = userEvent.setup();

    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; query?: Record<string, unknown> }) => {
      if (path.includes("/auth/me")) return SCHOOL_ADMIN_USER;
      if (path === "/api/v1/students/st-1") return STUDENT;
      if (path === "/api/v1/students/st-1/guardians" && (!opts?.method || opts.method === "GET")) {
        return [guardian()];
      }
      if (path === "/api/v1/students/st-1/guardians/g1" && opts?.method === "DELETE" && !opts.query?.force) {
        throw new ApiError(400, {
          statusCode: 400,
          message: "This is the student's only guardian.",
          error: "Bad Request",
          path,
          timestamp: new Date().toISOString(),
        });
      }
      if (path === "/api/v1/students/st-1/guardians/g1" && opts?.method === "DELETE" && opts.query?.force) {
        return { id: "link-1" };
      }
      throw new Error(`unexpected apiRequest call: ${path} ${opts?.method ?? "GET"}`);
    });

    renderDetailPage();
    await screen.findByText("Tunde Adeyemi");
    await user.click(screen.getByRole("button", { name: "Remove Tunde Adeyemi" }));

    let dialog = within(await screen.findByRole("dialog", { name: "Remove guardian" }));
    await user.click(dialog.getByRole("button", { name: "Remove" }));

    dialog = within(await screen.findByRole("dialog", { name: "Remove the only guardian?" }));
    expect(dialog.getByText(/leaves the student with no guardian on record/)).toBeInTheDocument();

    const forceConfirm = () => dialog.getByRole("button", { name: "Remove anyway" });
    expect(forceConfirm()).toBeDisabled();

    await user.type(dialog.getByLabelText(/Type/), STUDENT.lastName);
    expect(forceConfirm()).not.toBeDisabled();

    await user.click(forceConfirm());

    await waitFor(() => {
      expect(mockedApiRequest).toHaveBeenCalledWith(
        "/api/v1/students/st-1/guardians/g1",
        expect.objectContaining({ method: "DELETE", query: { force: "true" } }),
      );
    });
  });
});

describe("StudentDetailPage — History tab", () => {
  it("humanizes actions and shows the withdraw reason", async () => {
    mockApi({
      auditLogs: [
        {
          id: "log-1",
          action: "student.withdraw",
          entityType: "student",
          entityId: "st-1",
          metadata: { reason: "Relocated to Abuja" },
          createdAt: "2026-10-01T00:00:00.000Z",
          actor: { id: "u1", firstName: "Adaobi", lastName: "Nwachukwu" },
        },
        {
          id: "log-2",
          action: "student.create",
          entityType: "student",
          entityId: "st-1",
          metadata: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          actor: { id: "u1", firstName: "Adaobi", lastName: "Nwachukwu" },
        },
      ],
    });
    const user = userEvent.setup();
    renderDetailPage();

    await screen.findByText("Oluwaseun Adeyemi");
    await user.click(screen.getByRole("tab", { name: "History" }));

    expect(await screen.findByText("Student withdrawn")).toBeInTheDocument();
    expect(screen.getByText("Reason: Relocated to Abuja")).toBeInTheDocument();
    expect(screen.getByText("Student created")).toBeInTheDocument();
    expect(screen.queryByText("student.withdraw")).not.toBeInTheDocument();
  });

  it("shows an empty message when there is no recorded activity", async () => {
    mockApi({ auditLogs: [] });
    const user = userEvent.setup();
    renderDetailPage();

    await screen.findByText("Oluwaseun Adeyemi");
    await user.click(screen.getByRole("tab", { name: "History" }));

    expect(await screen.findByText("No recorded activity yet.")).toBeInTheDocument();
  });
});
