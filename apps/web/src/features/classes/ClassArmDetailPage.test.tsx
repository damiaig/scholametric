import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import type { ClassArmDetail } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ClassArmDetailPage } from "./ClassArmDetailPage";

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

const ARM_DETAIL: ClassArmDetail = {
  id: "arm-1",
  name: "A",
  classLevel: { id: "lvl-1", name: "JSS 1", rank: 1 },
  classTeacher: { userId: "t-1", firstName: "Bola", lastName: "Ogundare" },
  subjectTeachers: [
    { id: "sta-1", subjectId: "subj-1", subjectName: "Mathematics", teacherUserId: "t-1", teacherFirstName: "Bola", teacherLastName: "Ogundare" },
  ],
  students: {
    items: [{ id: "st-1", firstName: "Chidi", lastName: "Okoro", admissionNumber: "SUN/2026/0001", status: "ACTIVE" }],
    total: 1,
    page: 1,
    pageSize: 20,
  },
};

function renderPage(role: string = "SCHOOL_ADMIN") {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return { ...SCHOOL_ADMIN_USER, role };
    if (path.includes("/class-arms/arm-1")) return ARM_DETAIL;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });

  return renderWithProviders(
    <Routes>
      <Route path="/classes/arms/:id" element={<ClassArmDetailPage />} />
    </Routes>,
    { route: "/classes/arms/arm-1" },
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("ClassArmDetailPage", () => {
  it("renders the class teacher, subject teachers, and enrolled students", async () => {
    renderPage();

    expect(await screen.findByText("JSS 1 A")).toBeInTheDocument();
    // Same teacher is both class teacher and a subject teacher in this
    // fixture; the subject-teachers list also renders twice (mobile card +
    // desktop table, only one visible per breakpoint via CSS) — jsdom
    // doesn't apply media queries, so both exist in the DOM at once.
    expect(screen.getAllByText("Bola Ogundare").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Mathematics").length).toBeGreaterThanOrEqual(1);
    const studentsSection = screen.getByText("Students").closest("section")!;
    const studentsTable = within(await within(studentsSection).findByRole("table"));
    expect(studentsTable.getByText("Chidi Okoro")).toBeInTheDocument();
    expect(studentsTable.getByText("SUN/2026/0001")).toBeInTheDocument();
  });

  it("TEACHER: no assign/add/remove controls render", async () => {
    renderPage("TEACHER");

    await screen.findByText("JSS 1 A");
    expect(screen.queryByRole("button", { name: /Change|Assign/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add subject teacher/ })).not.toBeInTheDocument();
  });
});
