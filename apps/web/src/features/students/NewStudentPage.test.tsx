import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useParams } from "react-router-dom";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { ApiError, apiRequest } from "../../lib/api-client";
import { NewStudentPage } from "./NewStudentPage";

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

const PROPRIETOR_USER = { ...SCHOOL_ADMIN_USER, role: "PROPRIETOR" };

function DetailMarker() {
  const { id } = useParams();
  return <div>Detail page for {id}</div>;
}

function renderNewStudentPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/students/new" element={<NewStudentPage />} />
      <Route path="/students/:id" element={<DetailMarker />} />
      <Route path="/students" element={<div>Students list marker</div>} />
    </Routes>,
    { route: "/students/new" },
  );
}

function mockApi(options: { createHandler?: () => unknown; user?: typeof SCHOOL_ADMIN_USER } = {}) {
  mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
    if (path.includes("/auth/me")) return options.user ?? SCHOOL_ADMIN_USER;
    if (path.includes("/class-levels")) {
      return { items: [{ id: "lvl-1", schoolId: "s1", name: "JSS 2", rank: 2 }], total: 1, page: 1, pageSize: 100 };
    }
    if (path.includes("/class-arms")) {
      return { items: [{ id: "arm-1", schoolId: "s1", classLevelId: "lvl-1", name: "A" }], total: 1, page: 1, pageSize: 100 };
    }
    if (path === "/api/v1/students" && opts?.method === "POST") {
      if (options.createHandler) return options.createHandler();
      return { id: "new-student-id" };
    }
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

async function bioSection() {
  return (await screen.findByText("Bio")).closest("div")!.parentElement as HTMLElement;
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  const bio = within(await bioSection());
  await user.type(bio.getByLabelText("First name"), "Chidi");
  await user.type(bio.getByLabelText("Last name"), "Okoro");
  await user.selectOptions(bio.getByLabelText("Gender"), "MALE");
  await user.type(bio.getByLabelText("Date of birth"), "2012-05-01");

  // First guardian entry defaults to "new" mode and primary; fill it in.
  await user.type(screen.getByLabelText("First name", { selector: "#guardian-0-first-name" }), "Tunde");
  await user.type(screen.getByLabelText("Last name", { selector: "#guardian-0-last-name" }), "Okoro");
  await user.type(screen.getByLabelText("Phone", { selector: "#guardian-0-phone" }), "+2348012345678");
  await user.selectOptions(screen.getByLabelText("Relationship to student"), "FATHER");

  await waitFor(() => expect(screen.getByLabelText("Class")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("Class"), "arm-1");
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("NewStudentPage", () => {
  it("PROPRIETOR can access the form (RBAC fix — was previously SCHOOL_ADMIN-only)", async () => {
    mockApi({ user: PROPRIETOR_USER });
    renderNewStudentPage();

    expect(await screen.findByLabelText("First name", { selector: "#firstName" })).toBeInTheDocument();
  });

  it("shows per-field validation errors when submitted empty", async () => {
    mockApi();
    const user = userEvent.setup();
    renderNewStudentPage();
    await screen.findByText("Bio");

    await user.click(screen.getByRole("button", { name: "Create student" }));

    // "First name is required" / "Last name is required" appear twice each —
    // once for the bio section, once for the first (empty, mode: "new")
    // guardian entry, since both schemas use identical message text.
    expect(await screen.findAllByText("First name is required")).toHaveLength(2);
    expect(screen.getAllByText("Last name is required")).toHaveLength(2);
    expect(screen.getByText("Select a relationship")).toBeInTheDocument();
    expect(screen.getByText("Class is required")).toBeInTheDocument();
  });

  it("submits the new guardians[] contract with the first guardian defaulting to primary", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    mockApi({
      createHandler: () => {
        return { id: "new-student-id" };
      },
    });
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path.includes("/auth/me")) return SCHOOL_ADMIN_USER;
      if (path.includes("/class-levels")) {
        return { items: [{ id: "lvl-1", schoolId: "s1", name: "JSS 2", rank: 2 }], total: 1, page: 1, pageSize: 100 };
      }
      if (path.includes("/class-arms")) {
        return { items: [{ id: "arm-1", schoolId: "s1", classLevelId: "lvl-1", name: "A" }], total: 1, page: 1, pageSize: 100 };
      }
      if (path === "/api/v1/students" && opts?.method === "POST") {
        capturedBody = opts.body as Record<string, unknown>;
        return { id: "new-student-id" };
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderNewStudentPage();
    await screen.findByText("Bio");

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create student" }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody!.guardians).toEqual([
      expect.objectContaining({
        firstName: "Tunde",
        lastName: "Okoro",
        phone: "+2348012345678",
        relationship: "FATHER",
        isPrimary: true,
      }),
    ]);
    // `mode` is a client-only discriminant — never sent to the backend.
    expect(capturedBody!.guardians as unknown[]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ mode: expect.anything() })]),
    );
  });

  it("adding a second guardian and making them primary flips isPrimary on both entries", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path.includes("/auth/me")) return SCHOOL_ADMIN_USER;
      if (path.includes("/class-levels")) {
        return { items: [{ id: "lvl-1", schoolId: "s1", name: "JSS 2", rank: 2 }], total: 1, page: 1, pageSize: 100 };
      }
      if (path.includes("/class-arms")) {
        return { items: [{ id: "arm-1", schoolId: "s1", classLevelId: "lvl-1", name: "A" }], total: 1, page: 1, pageSize: 100 };
      }
      if (path === "/api/v1/students" && opts?.method === "POST") {
        capturedBody = opts.body as Record<string, unknown>;
        return { id: "new-student-id" };
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderNewStudentPage();
    await screen.findByText("Bio");
    await fillValidForm(user);

    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    await user.type(screen.getByLabelText("First name", { selector: "#guardian-1-first-name" }), "Ngozi");
    await user.type(screen.getByLabelText("Last name", { selector: "#guardian-1-last-name" }), "Okoro");
    await user.type(screen.getByLabelText("Phone", { selector: "#guardian-1-phone" }), "+2348099998888");
    await user.selectOptions(screen.getAllByLabelText("Relationship to student")[1], "MOTHER");

    // Second guardian is not primary by default; making them primary should
    // clear the first entry's isPrimary via the shared radio group.
    const radios = screen.getAllByRole("radio", { name: "Primary guardian" });
    await user.click(radios[1]);

    await user.click(screen.getByRole("button", { name: "Create student" }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    const guardians = capturedBody!.guardians as Array<{ firstName: string; isPrimary: boolean }>;
    expect(guardians.find((g) => g.firstName === "Tunde")?.isPrimary).toBe(false);
    expect(guardians.find((g) => g.firstName === "Ngozi")?.isPrimary).toBe(true);
  });

  it("renders a mocked 409 inline on the admission number field, not as a toast", async () => {
    mockApi({
      createHandler: () => {
        throw new ApiError(409, {
          statusCode: 409,
          message: "A student with this admission number already exists.",
          error: "Conflict",
          path: "/api/v1/students",
          timestamp: new Date().toISOString(),
        });
      },
    });
    const user = userEvent.setup();
    renderNewStudentPage();
    await screen.findByText("Bio");

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create student" }));

    const admissionNumberInput = await screen.findByLabelText("Admission number (optional)");
    await waitFor(() => {
      expect(admissionNumberInput.closest("div")).toHaveTextContent(
        "A student with this admission number already exists.",
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("navigates to the new student's detail page on success", async () => {
    mockApi({ createHandler: () => ({ id: "new-student-id" }) });
    const user = userEvent.setup();
    renderNewStudentPage();
    await screen.findByText("Bio");

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create student" }));

    expect(await screen.findByText("Detail page for new-student-id")).toBeInTheDocument();
  });
});
