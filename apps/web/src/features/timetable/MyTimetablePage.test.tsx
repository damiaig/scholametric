import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassTimetableResponse, MyChildrenResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { MyTimetablePage } from "./MyTimetablePage";
import { addDaysToDateString, addWeeks, getCurrentWeekRange, todayDateString } from "./current-week-range";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

// The real flatpickr widget is proven once, in styled-date-picker.test.tsx
// — page-level tests mock it down to its value/onChange contract.
vi.mock("../../components/ui/styled-date-picker", () => ({
  StyledDatePicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <button type="button" aria-label="Choose a date" onClick={() => onChange("2026-12-25")}>
      {value}
    </button>
  ),
}));

const mockedApiRequest = vi.mocked(apiRequest);

const STUDENT_USER = {
  id: "u2",
  email: null,
  firstName: "Chidinma",
  lastName: "Okafor",
  role: "STUDENT",
  status: "ACTIVE",
  lastLoginAt: null,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

const PARENT_USER = { ...STUDENT_USER, id: "u3", role: "PARENT" };

const WEEKDAY_BY_INDEX = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
function weekdayFor(dateString: string): (typeof WEEKDAY_BY_INDEX)[number] {
  const [year, month, day] = dateString.split("-").map(Number);
  return WEEKDAY_BY_INDEX[new Date(year, month - 1, day).getDay()];
}

// Defaults to the real "today" — the page's Agenda tab requests that date
// on mount, so a test that doesn't care which exact date is used (most of
// them) still gets a fixture that's valid for a "Today" assertion should
// one ever check it, with no hardcoded date to go stale.
function response(className: string, date: string = todayDateString()): ClassTimetableResponse {
  return {
    classArmId: "arm1",
    className,
    from: date,
    to: date,
    days: [
      {
        date,
        dayOfWeek: weekdayFor(date),
        isSchoolDay: true,
        nonSchoolReason: null,
        holidayName: null,
        periods: [
          {
            periodId: "p1",
            periodName: "Period 1",
            startsAt: "08:00",
            endsAt: "08:45",
            subjectId: "sub1",
            subjectName: "Mathematics",
            teacherUserId: "t1",
            teacherName: "Bola Ogundare",
            classArmId: null,
            className: null,
            status: null,
            exceptionId: null,
            note: null,
            replacementTeacherUserId: null,
            replacementTeacherName: null,
            replacementSubjectId: null,
            replacementSubjectName: null,
            activityLabel: null,
          },
        ],
        breaks: [],
      },
    ],
  };
}

// v0.8 walk-found fix — a Mon-Sat week where this class's Saturday is
// WEEKEND-excluded (includesSaturday: false), to prove the Full-week grid
// drops that column while still showing Mon-Fri with their correct dates.
// Sunday isn't part of this fixture at all — the real backend never
// returns it either, since getCurrentWeekRange no longer requests it.
// Fixed calendar dates throughout — the Full-week grid's date-label and
// Saturday-exclusion logic doesn't depend on which real day the suite
// runs on, unlike the Agenda-tab tests below.
function weekResponse(): ClassTimetableResponse {
  const weekdays: Array<[string, string]> = [
    ["2026-09-14", "MONDAY"],
    ["2026-09-15", "TUESDAY"],
    ["2026-09-16", "WEDNESDAY"],
    ["2026-09-17", "THURSDAY"],
    ["2026-09-18", "FRIDAY"],
  ];
  return {
    classArmId: "arm1",
    className: "JSS 2 A",
    from: "2026-09-14",
    to: "2026-09-19",
    days: [
      ...weekdays.map(([date, dayOfWeek]) => ({
        date,
        dayOfWeek: dayOfWeek as ClassTimetableResponse["days"][number]["dayOfWeek"],
        isSchoolDay: true,
        nonSchoolReason: null,
        holidayName: null,
        periods: [
          {
            periodId: "p1",
            periodName: "Period 1",
            startsAt: "08:00",
            endsAt: "08:45",
            subjectId: "sub1",
            subjectName: "Mathematics",
            teacherUserId: "t1",
            teacherName: "Bola Ogundare",
            classArmId: null,
            className: null,
            status: null,
            exceptionId: null,
            note: null,
            replacementTeacherUserId: null,
            replacementTeacherName: null,
            replacementSubjectId: null,
            replacementSubjectName: null,
            activityLabel: null,
          },
        ],
        breaks: [],
      })),
      { date: "2026-09-19", dayOfWeek: "SATURDAY", isSchoolDay: false, nonSchoolReason: "WEEKEND", holidayName: null, periods: [], breaks: [] },
    ],
  };
}

const CHILDREN: MyChildrenResponse = {
  children: [
    { studentId: "child1", firstName: "Ada", lastName: "Okafor", admissionNumber: "A1", gender: "FEMALE", dateOfBirth: "2012-01-01", status: "ACTIVE", currentClassArmLabel: "JSS 2 A" },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("MyTimetablePage", () => {
  // v0.8 walk-found bug: this page used to call GET /calendar/periods
  // (SCHOOL_ADMIN/PROPRIETOR only) to build the week grid's rows, which
  // 403'd for a STUDENT/PARENT. There's deliberately no mock for that path
  // in these tests — if the page ever calls it again, the catch-all
  // `throw` below fails the test immediately with a clear message.
  it("STUDENT: defaults to the Agenda tab showing today, no child-switcher, no GET /calendar/periods call", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return STUDENT_USER;
      if (path === "/api/v1/me/timetable") return response("JSS 2 A");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyTimetablePage />);

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.queryByLabelText("Child")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("STUDENT: switches to the Full week tab, rendering the grid built from the timetable response alone", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return STUDENT_USER;
      if (path === "/api/v1/me/timetable") return response("JSS 2 A");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<MyTimetablePage />);
    await screen.findByText("Mathematics");

    await user.click(screen.getByRole("tab", { name: "Full week" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Period 1")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
  });

  // Belt-and-braces on top of the no-mock enforcement above: even if
  // something DID try to call the admin-only endpoint, a 403 there must
  // not break this page.
  it("STUDENT: renders the Full week grid even if GET /calendar/periods would 403", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return STUDENT_USER;
      if (path === "/api/v1/me/timetable") return response("JSS 2 A");
      if (path === "/api/v1/calendar/periods") throw new Error("Forbidden");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<MyTimetablePage />);
    await screen.findByText("Mathematics");
    await user.click(screen.getByRole("tab", { name: "Full week" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your timetable.")).not.toBeInTheDocument();
  });

  // v0.8 walk-found fix — a class without Saturday enabled must show
  // Mon-Fri only: no Saturday column (WEEKEND-excluded), and no Sunday
  // column at all (never requested/returned in the first place).
  it("STUDENT: Full week grid shows Mon-Fri with correct dates, no Saturday (WEEKEND) and no Sunday column", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return STUDENT_USER;
      if (path === "/api/v1/me/timetable") return weekResponse();
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<MyTimetablePage />);
    await screen.findByText("Mathematics");
    await user.click(screen.getByRole("tab", { name: "Full week" }));
    await screen.findByRole("table");

    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Friday")).toBeInTheDocument();
    expect(screen.getByText(/Sep 14, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Sep 18, 2026/)).toBeInTheDocument();
    expect(screen.queryByText("Saturday")).not.toBeInTheDocument();
    expect(screen.queryByText("Sunday")).not.toBeInTheDocument();
  });

  // v0.8.1 step 1 (SPEC_V0.8.1.md §2.1) — Full-week keeps its own
  // weekOffset nav, entirely independent of the Agenda tab's day state now
  // (they used to share one weekOffset — intentionally decoupled this
  // step, since a day and a week-offset aren't the same unit once a
  // date-picker can jump to any day).
  it("STUDENT: Full week's Next-week navigation shifts only the week query; the Agenda tab's date is untouched", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const weekRanges: { from: string; to: string }[] = [];
    const agendaDates: string[] = [];
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, string | number | undefined> }) => {
      if (path.includes("/auth/me")) return STUDENT_USER;
      if (path === "/api/v1/me/timetable") {
        const from = String(opts?.query?.from);
        const to = String(opts?.query?.to);
        if (from === to) {
          agendaDates.push(from);
          return response("JSS 2 A", from);
        }
        weekRanges.push({ from, to });
        return weekResponse();
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<MyTimetablePage />);
    await screen.findByText("Mathematics");
    await user.click(screen.getByRole("tab", { name: "Full week" }));
    await screen.findByRole("table");

    const thisWeek = getCurrentWeekRange(addWeeks(new Date(), 0));
    await waitFor(() => expect(weekRanges).toContainEqual(thisWeek));

    await user.click(screen.getByRole("button", { name: "Next week" }));
    const nextWeek = getCurrentWeekRange(addWeeks(new Date(), 1));
    await waitFor(() => expect(weekRanges).toContainEqual(nextWeek));

    // the agenda's single-day request never changed — one date throughout
    expect(new Set(agendaDates).size).toBe(1);
  });

  // v0.8.1 step 1 (SPEC_V0.8.1.md §2.1, 2.3) — the Agenda tab's day-by-day
  // nav, its own independent state: Next/Previous/pick-a-date/Today, and
  // the floor (Previous disabled on today).
  it("STUDENT: Agenda day navigation (Next/Previous/pick/Today) shifts only the day query; Full week's range is untouched", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const agendaDates: string[] = [];
    const weekRanges: { from: string; to: string }[] = [];
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, string | number | undefined> }) => {
      if (path.includes("/auth/me")) return STUDENT_USER;
      if (path === "/api/v1/me/timetable") {
        const from = String(opts?.query?.from);
        const to = String(opts?.query?.to);
        if (from === to) {
          agendaDates.push(from);
          return response("JSS 2 A", from);
        }
        weekRanges.push({ from, to });
        return weekResponse();
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<MyTimetablePage />);
    await screen.findByText("Mathematics");

    const today = todayDateString();
    await waitFor(() => expect(agendaDates).toContain(today));
    expect(screen.getByRole("button", { name: "Previous day" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next day" }));
    const tomorrow = addDaysToDateString(today, 1);
    await waitFor(() => expect(agendaDates).toContain(tomorrow));
    expect(screen.getByRole("button", { name: "Previous day" })).not.toBeDisabled();

    await user.click(screen.getByLabelText("Choose a date"));
    await waitFor(() => expect(agendaDates).toContain("2026-12-25"));

    await user.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(agendaDates.filter((d) => d === today).length).toBeGreaterThan(1));

    // Full week's own range never shifted throughout any of this navigation
    expect(new Set(weekRanges.map((r) => `${r.from}|${r.to}`)).size).toBe(1);
  });

  it("PARENT: shows the child-switcher, defaults to the first child, and loads that child's timetable", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return PARENT_USER;
      if (path === "/api/v1/me/children") return CHILDREN;
      if (path === "/api/v1/me/children/child1/timetable") return response("JSS 2 A");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyTimetablePage />);

    expect(await screen.findByLabelText("Child")).toBeInTheDocument();
    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
  });

  it("PARENT: switches to the Full week tab, rendering the grid built from the timetable response alone", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return PARENT_USER;
      if (path === "/api/v1/me/children") return CHILDREN;
      if (path === "/api/v1/me/children/child1/timetable") return response("JSS 2 A");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<MyTimetablePage />);
    await screen.findByText("Mathematics");

    await user.click(screen.getByRole("tab", { name: "Full week" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("PARENT: Full week's Next-week navigation shifts only the week query for the selected child; the Agenda tab's date is untouched", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const weekRanges: { from: string; to: string }[] = [];
    const agendaDates: string[] = [];
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, string | number | undefined> }) => {
      if (path.includes("/auth/me")) return PARENT_USER;
      if (path === "/api/v1/me/children") return CHILDREN;
      if (path === "/api/v1/me/children/child1/timetable") {
        const from = String(opts?.query?.from);
        const to = String(opts?.query?.to);
        if (from === to) {
          agendaDates.push(from);
          return response("JSS 2 A", from);
        }
        weekRanges.push({ from, to });
        return weekResponse();
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<MyTimetablePage />);
    await screen.findByText("Mathematics");
    await user.click(screen.getByRole("tab", { name: "Full week" }));
    await screen.findByRole("table");

    const thisWeek = getCurrentWeekRange(addWeeks(new Date(), 0));
    await waitFor(() => expect(weekRanges).toContainEqual(thisWeek));

    await user.click(screen.getByRole("button", { name: "Next week" }));
    const nextWeek = getCurrentWeekRange(addWeeks(new Date(), 1));
    await waitFor(() => expect(weekRanges).toContainEqual(nextWeek));

    expect(new Set(agendaDates).size).toBe(1);
  });

  it("PARENT: no children shows the empty state, not an error", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return PARENT_USER;
      if (path === "/api/v1/me/children") return { children: [] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyTimetablePage />);
    expect(await screen.findByText("No children linked to your account yet.")).toBeInTheDocument();
  });

  it("PARENT: switching child requests that child's own timetable", async () => {
    const user = userEvent.setup();
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const children: MyChildrenResponse = {
      children: [
        ...CHILDREN.children,
        { studentId: "child2", firstName: "Emeka", lastName: "Okafor", admissionNumber: "A2", gender: "MALE", dateOfBirth: "2013-01-01", status: "ACTIVE", currentClassArmLabel: "JSS 1 B" },
      ],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return PARENT_USER;
      if (path === "/api/v1/me/children") return children;
      if (path === "/api/v1/me/children/child1/timetable") return response("JSS 2 A");
      if (path === "/api/v1/me/children/child2/timetable") return response("JSS 1 B");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyTimetablePage />);
    await screen.findByText("Mathematics");

    await user.selectOptions(screen.getByLabelText("Child"), "child2");
    expect(await screen.findByText("JSS 1 B")).toBeInTheDocument();
  });
});
