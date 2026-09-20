import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Period, TeacherTimetableResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { TeacherTimetablePage } from "./TeacherTimetablePage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const PERIOD_1: Period = { id: "p1", schoolId: "s1", name: "Period 1", startsAt: "08:00", endsAt: "08:45", sortOrder: 1, createdAt: "t", updatedAt: "t" };

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
  it("defaults to the Agenda tab, showing which class each period belongs to", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/periods") return [PERIOD_1];
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

  it("switches to the Full week tab, rendering the grid instead", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/periods") return [PERIOD_1];
      if (path === "/api/v1/me/teaching-timetable") return RESPONSE;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<TeacherTimetablePage />);
    await screen.findByText("Today");

    await user.click(screen.getByRole("tab", { name: "Full week" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });

  it("offers 'Mark absent' regardless of which tab is active", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/periods") return [PERIOD_1];
      if (path === "/api/v1/me/teaching-timetable") return RESPONSE;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TeacherTimetablePage />);
    expect(await screen.findByRole("button", { name: "Mark absent" })).toBeInTheDocument();
  });

  it("shows an error state with retry when the timetable fails to load", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/periods") return [PERIOD_1];
      if (path === "/api/v1/me/teaching-timetable") throw new Error("boom");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TeacherTimetablePage />);
    expect(await screen.findByText("Couldn't load your timetable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
