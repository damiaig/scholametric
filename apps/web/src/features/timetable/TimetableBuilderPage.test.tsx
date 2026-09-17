import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { ClassArmDetail, Paginated, AcademicSession, Period, ClassSchoolDays, TimetableSlot } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { TimetableBuilderPage } from "./TimetableBuilderPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

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

const ARM_DETAIL: ClassArmDetail = {
  id: "arm1",
  name: "A",
  classLevel: { id: "lvl1", name: "JSS 2", rank: 2 },
  classTeacher: null,
  subjectTeachers: [
    { id: "sta1", subjectId: "11111111-1111-1111-1111-111111111111", subjectName: "Mathematics", teacherUserId: "33333333-3333-3333-3333-333333333333", teacherFirstName: "Bola", teacherLastName: "Ogundare" },
    { id: "sta2", subjectId: "22222222-2222-2222-2222-222222222222", subjectName: "English Language", teacherUserId: "44444444-4444-4444-4444-444444444444", teacherFirstName: "Ngozi", teacherLastName: "Chukwuma" },
  ],
  students: { items: [], total: 0, page: 1, pageSize: 1 },
};

const SESSION: AcademicSession = {
  id: "sess1",
  schoolId: "s1",
  name: "2026/2027",
  startsOn: "2026-09-01",
  endsOn: "2027-07-31",
  isCurrent: true,
  createdAt: "t",
  updatedAt: "t",
};

const PERIOD_1: Period = { id: "p1", schoolId: "s1", name: "Period 1", startsAt: "08:00", endsAt: "08:45", sortOrder: 1, createdAt: "t", updatedAt: "t" };
const PERIOD_2: Period = { id: "p2", schoolId: "s1", name: "Period 2", startsAt: "08:45", endsAt: "09:30", sortOrder: 2, createdAt: "t", updatedAt: "t" };

const SCHOOL_DAYS_NO_SAT: ClassSchoolDays[] = [{ classArmId: "arm1", classArmName: "A", classLevelName: "JSS 2", includesSaturday: false }];
const SCHOOL_DAYS_SAT: ClassSchoolDays[] = [{ classArmId: "arm1", classArmName: "A", classLevelName: "JSS 2", includesSaturday: true }];

const MATH_MONDAY_SLOT: TimetableSlot = {
  id: "slot1",
  classArmId: "arm1",
  sessionId: "sess1",
  dayOfWeek: "MONDAY",
  periodId: "p1",
  periodName: "Period 1",
  subjectId: "11111111-1111-1111-1111-111111111111",
  subjectName: "Mathematics",
  teacherUserId: "33333333-3333-3333-3333-333333333333",
  teacherName: "Bola Ogundare",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

function renderPage(route = "/timetable/arms/arm1") {
  return renderWithProviders(
    <Routes>
      <Route path="/timetable/arms/:id" element={<TimetableBuilderPage />} />
    </Routes>,
    { route },
  );
}

function mockLoad(opts: { subjectTeachers?: ClassArmDetail["subjectTeachers"]; schoolDays?: ClassSchoolDays[]; slots?: TimetableSlot[] } = {}) {
  const armDetail = { ...ARM_DETAIL, subjectTeachers: opts.subjectTeachers ?? ARM_DETAIL.subjectTeachers };
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
  mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
    const method = options?.method ?? "GET";
    if (path.includes("/auth/me")) return ADMIN_USER;
    if (path === "/api/v1/class-arms/arm1") return armDetail;
    if (path === "/api/v1/sessions") return { items: [SESSION], total: 1, page: 1, pageSize: 50 } satisfies Paginated<AcademicSession>;
    if (path === "/api/v1/calendar/periods") return [PERIOD_1, PERIOD_2];
    if (path === "/api/v1/calendar/class-school-days") return opts.schoolDays ?? SCHOOL_DAYS_NO_SAT;
    if (path === "/api/v1/calendar/timetable-slots" && method === "GET") return opts.slots ?? [];
    throw new Error(`unexpected apiRequest call: ${method} ${path}`);
  });
  return armDetail;
}

describe("TimetableBuilderPage", () => {
  it("renders the grid: periods as rows, Mon-Fri columns (no Saturday, includesSaturday: false)", async () => {
    mockLoad();
    renderPage();

    expect(await screen.findByText("JSS 2 A")).toBeInTheDocument();
    expect(screen.getByText("Period 1")).toBeInTheDocument();
    expect(screen.getByText("Period 2")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Monday" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Friday" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Saturday" })).not.toBeInTheDocument();
  });

  it("Saturday column appears once includesSaturday is true", async () => {
    mockLoad({ schoolDays: SCHOOL_DAYS_SAT });
    renderPage();

    expect(await screen.findByText("JSS 2 A")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Saturday" })).toBeInTheDocument();
  });

  it("shows the not-assigned empty state when the class has zero subject teachers", async () => {
    mockLoad({ subjectTeachers: [] });
    renderPage();
    expect(await screen.findByText(/No subject teachers are assigned/)).toBeInTheDocument();
  });

  it("an existing slot renders subject + teacher in its cell", async () => {
    mockLoad({ slots: [MATH_MONDAY_SLOT] });
    renderPage();

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Bola Ogundare")).toBeInTheDocument();
  });

  it("clicking an empty cell opens the dialog; submitting POSTs with the derived teacherUserId", async () => {
    const user = userEvent.setup();
    mockLoad();
    renderPage();
    await screen.findByText("JSS 2 A");

    await user.click(screen.getByRole("button", { name: /Assign a subject on Monday Period 1/ }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Subject"), "11111111-1111-1111-1111-111111111111");
    await user.click(within(dialog).getByRole("button", { name: "Assign" }));

    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/api/v1/calendar/timetable-slots",
      expect.objectContaining({
        method: "POST",
        body: { classArmId: "arm1", sessionId: "sess1", dayOfWeek: "MONDAY", periodId: "p1", subjectId: "11111111-1111-1111-1111-111111111111", teacherUserId: "33333333-3333-3333-3333-333333333333" },
      }),
    );
  });

  it("the dialog offers no teacher control — only Subject", async () => {
    const user = userEvent.setup();
    mockLoad();
    renderPage();
    await screen.findByText("JSS 2 A");

    await user.click(screen.getByRole("button", { name: /Assign a subject on Monday Period 1/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Subject")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/teacher/i)).not.toBeInTheDocument();
  });

  it("clicking a filled cell opens the dialog prefilled with its current subject", async () => {
    const user = userEvent.setup();
    mockLoad({ slots: [MATH_MONDAY_SLOT] });
    renderPage();
    await screen.findByText("Mathematics");

    await user.click(screen.getByText("Mathematics"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Subject")).toHaveValue("11111111-1111-1111-1111-111111111111");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("Remove deletes a slot after confirming", async () => {
    const user = userEvent.setup();
    let deleted = false;
    mockLoad({ slots: [] });
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      const method = options?.method ?? "GET";
      if (path.includes("/auth/me")) return ADMIN_USER;
      if (path === "/api/v1/class-arms/arm1") return ARM_DETAIL;
      if (path === "/api/v1/sessions") return { items: [SESSION], total: 1, page: 1, pageSize: 50 };
      if (path === "/api/v1/calendar/periods") return [PERIOD_1, PERIOD_2];
      if (path === "/api/v1/calendar/class-school-days") return SCHOOL_DAYS_NO_SAT;
      if (path === "/api/v1/calendar/timetable-slots" && method === "GET") return deleted ? [] : [MATH_MONDAY_SLOT];
      if (path === "/api/v1/calendar/timetable-slots/slot1" && method === "DELETE") {
        deleted = true;
        return { id: "slot1" };
      }
      throw new Error(`unexpected apiRequest call: ${method} ${path}`);
    });
    renderPage();
    await screen.findByText("Mathematics");

    await user.click(screen.getByRole("button", { name: /Remove Mathematics on Monday Period 1/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await screen.findByRole("button", { name: /Assign a subject on Monday Period 1/ });
    expect(screen.queryByText("Mathematics")).not.toBeInTheDocument();
  });
});
