import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { ClassLevelOverview, Subject, TeacherDetail } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { ApiError, apiRequest } from "../../lib/api-client";
import { TeacherDetailPage } from "./TeacherDetailPage";

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

function teacherDetail(overrides: Partial<TeacherDetail> = {}): TeacherDetail {
  return {
    id: "t-1",
    schoolId: "s1",
    email: "bola@sunrise.test",
    firstName: "Bola",
    lastName: "Ogundare",
    role: "TEACHER",
    status: "ACTIVE",
    lastLoginAt: null,
    staffProfileId: "sp-1",
    staffNumber: "SUN/STF/0001",
    jobTitle: "TEACHER",
    phone: "+2348012345678",
    qualification: "B.Sc Mathematics",
    dateEmployed: "2024-01-10T00:00:00.000Z",
    classTeacherOf: [],
    subjectsTaught: [
      { id: "sta-1", subjectId: "subj-1", subjectName: "Mathematics", classArmId: "arm-1", className: "JSS 1 A" },
    ],
    ...overrides,
  };
}

const CLASSES: ClassLevelOverview[] = [
  {
    id: "lvl-1",
    name: "JSS 1",
    rank: 1,
    arms: [
      { id: "arm-1", name: "A", enrollmentCount: 25, classTeacher: null },
      {
        id: "arm-2",
        name: "B",
        enrollmentCount: 20,
        classTeacher: { userId: "t-2", firstName: "Chidi", lastName: "Okoro" },
      },
    ],
  },
];

const SUBJECTS: Subject[] = [
  { id: "subj-1", schoolId: "s1", name: "Mathematics", code: null, createdAt: "", updatedAt: "" },
];

function renderPage(role: string = "SCHOOL_ADMIN") {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
  mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path.includes("/auth/me")) return { ...SCHOOL_ADMIN_USER, role };
    if (path.includes("/teachers/t-1")) return teacherDetail();
    if (path.includes("/classes")) return CLASSES;
    if (path.includes("/subjects")) return { items: SUBJECTS, total: 1, page: 1, pageSize: 100 };
    if (path === "/api/v1/subject-assignments" && opts?.method === "POST") {
      const body = opts.body as { classArmId: string };
      if (body.classArmId === "arm-2") {
        throw new ApiError(409, {
          statusCode: 409,
          message: "This subject is already assigned to Chidi Okoro for this class.",
          error: "Conflict",
          path: "/api/v1/subject-assignments",
          timestamp: new Date().toISOString(),
        });
      }
      return { id: "new-assignment", subjectId: body.classArmId, classArmId: body.classArmId };
    }
    throw new Error(`unexpected apiRequest call: ${path} ${opts?.method ?? "GET"}`);
  });

  return renderWithProviders(
    <Routes>
      <Route path="/teachers/:id" element={<TeacherDetailPage />} />
    </Routes>,
    { route: "/teachers/t-1" },
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("TeacherDetailPage", () => {
  it("renders profile details and current assignments", async () => {
    renderPage();

    expect(await screen.findByText("Bola Ogundare")).toBeInTheDocument();
    expect(screen.getByText("SUN/STF/0001")).toBeInTheDocument();
    expect(screen.getByText("B.Sc Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("JSS 1 A")).toBeInTheDocument();
    expect(screen.getByText("Not currently a class teacher for any arm.")).toBeInTheDocument();
  });

  it("assign-subject dialog surfaces the named 409 conflict inline, per arm", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Bola Ogundare");

    await user.click(screen.getByRole("button", { name: /Add subject/ }));
    await user.selectOptions(await screen.findByLabelText("Subject"), "subj-1");
    await user.click(screen.getByRole("checkbox", { name: /JSS 1 A/ }));
    await user.click(screen.getByRole("checkbox", { name: /JSS 1 B/ }));
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("This subject is already assigned to Chidi Okoro for this class."),
    ).toBeInTheDocument();
    // The dialog stays open (one arm conflicted) rather than closing/toasting.
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("TEACHER: no Assign/Add/Remove controls render", async () => {
    renderPage("TEACHER");

    await screen.findByText("Bola Ogundare");
    expect(screen.queryByRole("button", { name: /Assign/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add subject/ })).not.toBeInTheDocument();
  });
});
