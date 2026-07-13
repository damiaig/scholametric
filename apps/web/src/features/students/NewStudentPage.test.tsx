import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
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

function mockApi(createHandler?: () => unknown) {
  mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
    if (path.includes("/auth/me")) return SCHOOL_ADMIN_USER;
    if (path.includes("/class-levels")) {
      return { items: [{ id: "lvl-1", schoolId: "s1", name: "JSS 2", rank: 2 }], total: 1, page: 1, pageSize: 100 };
    }
    if (path.includes("/class-arms")) {
      return { items: [{ id: "arm-1", schoolId: "s1", classLevelId: "lvl-1", name: "A" }], total: 1, page: 1, pageSize: 100 };
    }
    if (path === "/api/v1/students" && opts?.method === "POST") {
      if (createHandler) return createHandler();
      return { id: "new-student-id" };
    }
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("First name"), "Chidi");
  await user.type(screen.getByLabelText("Last name"), "Okoro");
  await user.selectOptions(screen.getByLabelText("Gender"), "MALE");
  await user.type(screen.getByLabelText("Date of birth"), "2012-05-01");
  await user.type(screen.getByLabelText("Guardian name"), "Test Guardian");
  await user.type(screen.getByLabelText("Guardian phone"), "+2348012345678");
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
  it("shows per-field validation errors when submitted empty", async () => {
    mockApi();
    const user = userEvent.setup();
    renderNewStudentPage();
    await screen.findByLabelText("First name");

    await user.click(screen.getByRole("button", { name: "Create student" }));

    expect(await screen.findByText("First name is required")).toBeInTheDocument();
    expect(screen.getByText("Last name is required")).toBeInTheDocument();
    expect(screen.getByText("Guardian name is required")).toBeInTheDocument();
    expect(screen.getByText("Guardian phone is required")).toBeInTheDocument();
    expect(screen.getByText("Class is required")).toBeInTheDocument();
  });

  it("renders a mocked 409 inline on the admission number field, not as a toast", async () => {
    mockApi(() => {
      throw new ApiError(409, {
        statusCode: 409,
        message: "A student with this admission number already exists.",
        error: "Conflict",
        path: "/api/v1/students",
        timestamp: new Date().toISOString(),
      });
    });
    const user = userEvent.setup();
    renderNewStudentPage();
    await screen.findByLabelText("First name");

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create student" }));

    const admissionNumberInput = await screen.findByLabelText("Admission number (optional)");
    await waitFor(() => {
      expect(admissionNumberInput.closest("div")).toHaveTextContent(
        "A student with this admission number already exists.",
      );
    });
    // Not a toast/top-level alert — only the inline field message.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("navigates to the new student's detail page on success", async () => {
    mockApi(() => ({ id: "new-student-id" }));
    const user = userEvent.setup();
    renderNewStudentPage();
    await screen.findByLabelText("First name");

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create student" }));

    expect(await screen.findByText("Detail page for new-student-id")).toBeInTheDocument();
  });
});
