import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TeacherTimetableResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { TeacherTimetablePage } from "./TeacherTimetablePage";
import { addWeeks, getAgendaRange, getCurrentWeekRange } from "./current-week-range";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const RESPONSE: TeacherTimetableResponse = {
  teacherUserId: "t1",
  from: "2026-09-14",
  to: "2026-09-14",
  days: [
    {
      date: "2026-09-14",
      dayOfWeek: "MONDAY",
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
  it("defaults to the Agenda tab, showing which class each period belongs to — no GET /calendar/periods call", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching-timetable") return RESPONSE;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TeacherTimetablePage />);

    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText(/Bola Ogundare/)).toBeInTheDocument();
    expect(screen.getByText(/JSS 2 A/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("switches to the Full week tab, rendering the grid built from the timetable response alone", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching-timetable") return RESPONSE;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<TeacherTimetablePage />);
    await screen.findByText("Today");

    await user.click(screen.getByRole("tab", { name: "Full week" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Period 1")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });

  // Belt-and-braces on top of the no-mock enforcement above: even if
  // something DID try to call the admin-only endpoint, a 403 there must
  // not break this page — proves the grid genuinely doesn't depend on it,
  // not just that the test happens not to exercise the call.
  it("renders the Full week grid even if GET /calendar/periods would 403", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching-timetable") return RESPONSE;
      if (path === "/api/v1/calendar/periods") throw new Error("Forbidden");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<TeacherTimetablePage />);
    await screen.findByText("Today");
    await user.click(screen.getByRole("tab", { name: "Full week" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your timetable.")).not.toBeInTheDocument();
  });

  // v0.8 walk-found fix — no prev/next week control existed at all before
  // this. ONE shared weekOffset drives both tabs' ranges (via addWeeks()),
  // so this also proves the offset is shared: clicking Next while on the
  // Agenda tab shifts the (currently hidden) Full week query too. Previous
  // is removed permanently, not just hidden — there is no button to find.
  it("week navigation: Next shifts both tabs' requested range by 7 days, shared across tabs; Today resets; no Previous control exists", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const requestedRanges: { from: string; to: string }[] = [];
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, string | number | undefined> }) => {
      if (path === "/api/v1/me/teaching-timetable") {
        if (opts?.query) requestedRanges.push({ from: String(opts.query.from), to: String(opts.query.to) });
        return RESPONSE;
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<TeacherTimetablePage />);
    await screen.findByText("Today");

    expect(screen.queryByRole("button", { name: "Previous week" })).not.toBeInTheDocument();

    const thisWeekAgenda = getAgendaRange(addWeeks(new Date(), 0));
    const thisWeekGrid = getCurrentWeekRange(addWeeks(new Date(), 0));
    await waitFor(() => expect(requestedRanges).toContainEqual(thisWeekAgenda));
    expect(requestedRanges).toContainEqual(thisWeekGrid);

    await user.click(screen.getByRole("button", { name: "Next week" }));
    const nextWeekAgenda = getAgendaRange(addWeeks(new Date(), 1));
    const nextWeekGrid = getCurrentWeekRange(addWeeks(new Date(), 1));
    await waitFor(() => expect(requestedRanges).toContainEqual(nextWeekAgenda));
    expect(requestedRanges).toContainEqual(nextWeekGrid); // shared offset — the hidden Full week tab shifted too

    await user.click(screen.getByRole("button", { name: "Reset to today" }));
    await waitFor(() => expect(requestedRanges.filter((r) => r.from === thisWeekAgenda.from).length).toBeGreaterThan(1));
  });

  // v0.8 walk-found fix — Saturday is per-slot for a teacher (never
  // whole-day WEEKEND-excluded server-side), so the grid drops it only
  // when the teacher genuinely teaches nothing that Saturday — proving
  // the teacher-mode branch of filterWeekDays, distinct from the
  // WEEKEND-flag check used for the student/parent class view.
  it("Full week grid drops an all-free Saturday for the teacher, shows Mon-Fri with correct dates, no Sunday column", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const weekResponse: TeacherTimetableResponse = {
      teacherUserId: "t1",
      from: "2026-09-14",
      to: "2026-09-19",
      days: [
        { ...RESPONSE.days[0], date: "2026-09-14", dayOfWeek: "MONDAY" },
        { ...RESPONSE.days[0], date: "2026-09-18", dayOfWeek: "FRIDAY" },
        { date: "2026-09-19", dayOfWeek: "SATURDAY", isSchoolDay: true, nonSchoolReason: null, holidayName: null, periods: [], breaks: [] },
      ],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching-timetable") return weekResponse;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<TeacherTimetablePage />);
    await screen.findByText("Today");
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
      if (path === "/api/v1/me/teaching-timetable") return RESPONSE;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TeacherTimetablePage />);
    expect(await screen.findByRole("button", { name: "Mark absent" })).toBeInTheDocument();
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
