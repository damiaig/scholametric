import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TeacherTimetableResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { TeacherTimetablePage } from "./TeacherTimetablePage";
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

const WEEKDAY_BY_INDEX = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
function weekdayFor(dateString: string): (typeof WEEKDAY_BY_INDEX)[number] {
  const [year, month, day] = dateString.split("-").map(Number);
  return WEEKDAY_BY_INDEX[new Date(year, month - 1, day).getDay()];
}

// Defaults to the real "today" — the page's Agenda tab requests that date
// on mount, so a test that doesn't care which exact date is used still
// gets a fixture valid for a "Today" assertion, with no hardcoded date to
// go stale.
function response(date: string = todayDateString()): TeacherTimetableResponse {
  return {
    teacherUserId: "t1",
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
            classArmId: "arm1",
            className: "JSS 2 A",
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("TeacherTimetablePage", () => {
  // v0.8 walk-found bug: this page used to call GET /calendar/periods
  // (SCHOOL_ADMIN/PROPRIETOR only) to build the week grid's rows, which
  // 403'd for a TEACHER. There's deliberately no mock for that path here —
  // if the page ever calls it again, the catch-all `throw` below fails
  // the test immediately with a clear message, not a silent pass.
  it("defaults to the Agenda tab showing today, showing which class each period belongs to — no GET /calendar/periods call", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching-timetable") return response();
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TeacherTimetablePage />);

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText(/Bola Ogundare/)).toBeInTheDocument();
    expect(screen.getByText(/JSS 2 A/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("switches to the Full week tab, rendering the grid built from the timetable response alone", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching-timetable") return response();
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<TeacherTimetablePage />);
    await screen.findByText("Mathematics");

    await user.click(screen.getByRole("tab", { name: "Full week" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Period 1")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
  });

  // Belt-and-braces on top of the no-mock enforcement above: even if
  // something DID try to call the admin-only endpoint, a 403 there must
  // not break this page — proves the grid genuinely doesn't depend on it,
  // not just that the test happens not to exercise the call.
  it("renders the Full week grid even if GET /calendar/periods would 403", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching-timetable") return response();
      if (path === "/api/v1/calendar/periods") throw new Error("Forbidden");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<TeacherTimetablePage />);
    await screen.findByText("Mathematics");
    await user.click(screen.getByRole("tab", { name: "Full week" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your timetable.")).not.toBeInTheDocument();
  });

  // v0.8.1 step 1 (SPEC_V0.8.1.md §2.1) — Full-week keeps its own
  // weekOffset nav, entirely independent of the Agenda tab's day state now
  // (intentionally decoupled this step — a day and a week-offset aren't
  // the same unit once a date-picker can jump to any day). Previous is
  // still gone from the Full-week control too (removed in the prior pass).
  it("Full week's Next-week navigation shifts only the week query; the Agenda tab's date is untouched; no Previous control exists", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const weekRanges: { from: string; to: string }[] = [];
    const agendaDates: string[] = [];
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, string | number | undefined> }) => {
      if (path === "/api/v1/me/teaching-timetable") {
        const from = String(opts?.query?.from);
        const to = String(opts?.query?.to);
        if (from === to) {
          agendaDates.push(from);
          return response(from);
        }
        weekRanges.push({ from, to });
        return response(); // shape doesn't matter for this test, just needs to resolve
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<TeacherTimetablePage />);
    await screen.findByText("Mathematics");
    await user.click(screen.getByRole("tab", { name: "Full week" }));
    await screen.findByRole("table");

    expect(screen.queryByRole("button", { name: "Previous week" })).not.toBeInTheDocument();

    const thisWeek = getCurrentWeekRange(addWeeks(new Date(), 0));
    await waitFor(() => expect(weekRanges).toContainEqual(thisWeek));

    await user.click(screen.getByRole("button", { name: "Next week" }));
    const nextWeek = getCurrentWeekRange(addWeeks(new Date(), 1));
    await waitFor(() => expect(weekRanges).toContainEqual(nextWeek));

    expect(new Set(agendaDates).size).toBe(1);
  });

  // v0.8.1 step 1 (SPEC_V0.8.1.md §2.1, 2.3) — the Agenda tab's day-by-day
  // nav, its own independent state: Next/Previous/pick-a-date/Today, and
  // the floor (Previous disabled on today).
  it("Agenda day navigation (Next/Previous/pick/Today) shifts only the day query; Full week's range is untouched", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const agendaDates: string[] = [];
    const weekRanges: { from: string; to: string }[] = [];
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, string | number | undefined> }) => {
      if (path === "/api/v1/me/teaching-timetable") {
        const from = String(opts?.query?.from);
        const to = String(opts?.query?.to);
        if (from === to) {
          agendaDates.push(from);
          return response(from);
        }
        weekRanges.push({ from, to });
        return response();
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<TeacherTimetablePage />);
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

    expect(new Set(weekRanges.map((r) => `${r.from}|${r.to}`)).size).toBe(1);
  });

  // v0.8 walk-found fix — Saturday is per-slot for a teacher (never
  // whole-day WEEKEND-excluded server-side), so the grid drops it only
  // when the teacher genuinely teaches nothing that Saturday — proving
  // the teacher-mode branch of filterWeekDays, distinct from the
  // WEEKEND-flag check used for the student/parent class view.
  it("Full week grid drops an all-free Saturday for the teacher, shows Mon-Fri with correct dates, no Sunday column", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const oneDay = response("2026-09-14").days[0];
    const weekResponse: TeacherTimetableResponse = {
      teacherUserId: "t1",
      from: "2026-09-14",
      to: "2026-09-19",
      days: [
        { ...oneDay, date: "2026-09-14", dayOfWeek: "MONDAY" },
        { ...oneDay, date: "2026-09-18", dayOfWeek: "FRIDAY" },
        { date: "2026-09-19", dayOfWeek: "SATURDAY", isSchoolDay: true, nonSchoolReason: null, holidayName: null, periods: [], breaks: [] },
      ],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching-timetable") return weekResponse;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<TeacherTimetablePage />);
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

  it("offers 'Mark absent' regardless of which tab is active", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching-timetable") return response();
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TeacherTimetablePage />);
    expect(await screen.findByRole("button", { name: "Mark absent" })).toBeInTheDocument();
  });

  // v0.8.1 step 1 — consequential fix: "Mark absent" used to source its
  // date options from the agenda's rolling window; now that the agenda is
  // a single day, it sources from weekTimetable instead (still fetched
  // unconditionally regardless of active tab) — a full Mon-Fri/Sat week of
  // dates to mark absence on, even while the Agenda tab is showing one day.
  it("'Mark absent' offers every school day from the full week, not just the single agenda day", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const oneDay = response("2026-09-14").days[0];
    const weekResponse: TeacherTimetableResponse = {
      teacherUserId: "t1",
      from: "2026-09-14",
      to: "2026-09-18",
      days: [
        { ...oneDay, date: "2026-09-14", dayOfWeek: "MONDAY" },
        { ...oneDay, date: "2026-09-15", dayOfWeek: "TUESDAY" },
        { ...oneDay, date: "2026-09-16", dayOfWeek: "WEDNESDAY" },
      ],
    };
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, string | number | undefined> }) => {
      if (path === "/api/v1/me/teaching-timetable") {
        const from = String(opts?.query?.from);
        const to = String(opts?.query?.to);
        if (from === to) return response(from); // the single-day Agenda request
        return weekResponse;
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<TeacherTimetablePage />);
    await screen.findByText("Mathematics");

    await user.click(screen.getByRole("button", { name: "Mark absent" }));
    const dateSelect = await screen.findByLabelText("Date");
    expect(screen.getAllByRole("option", { name: /Monday|Tuesday|Wednesday/ })).toHaveLength(3);
    expect(dateSelect).toBeInTheDocument();
  });

  it("shows an error state with retry when the timetable fails to load", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching-timetable") throw new Error("boom");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TeacherTimetablePage />);
    expect(await screen.findByText("Couldn't load your timetable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
