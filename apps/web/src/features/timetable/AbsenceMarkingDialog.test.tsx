import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ResolvedTimetableDay } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { AbsenceMarkingDialog } from "./AbsenceMarkingDialog";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const BASE_PERIOD_ENTRY = {
  status: null,
  exceptionId: null,
  note: null,
  replacementTeacherUserId: null,
  replacementTeacherName: null,
  replacementSubjectId: null,
  replacementSubjectName: null,
  activityLabel: null,
};

const MONDAY: ResolvedTimetableDay = {
  date: "2026-09-14",
  dayOfWeek: "MONDAY",
  isSchoolDay: true,
  nonSchoolReason: null,
  holidayName: null,
  periods: [
    { ...BASE_PERIOD_ENTRY, periodId: "11111111-1111-1111-1111-111111111111", periodName: "Period 1", startsAt: "08:00", endsAt: "08:45", subjectId: "sub1", subjectName: "Mathematics", teacherUserId: "t1", teacherName: "Bola Ogundare", classArmId: "arm1", className: "JSS 2 A" },
    // Already cancelled — must NOT be offered again.
    { ...BASE_PERIOD_ENTRY, periodId: "22222222-2222-2222-2222-222222222222", periodName: "Period 2", startsAt: "08:45", endsAt: "09:30", subjectId: "sub2", subjectName: "English Language", teacherUserId: "t1", teacherName: "Bola Ogundare", classArmId: "arm2", className: "JSS 1 A", status: "CANCELLED", exceptionId: "exc1" },
  ],
  breaks: [],
};

const SUNDAY: ResolvedTimetableDay = {
  date: "2026-09-20",
  dayOfWeek: "SUNDAY",
  isSchoolDay: false,
  nonSchoolReason: "WEEKEND",
  holidayName: null,
  periods: [],
  breaks: [],
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("AbsenceMarkingDialog", () => {
  it("only offers school days as date options", () => {
    renderWithProviders(<AbsenceMarkingDialog open onClose={vi.fn()} days={[MONDAY, SUNDAY]} />);
    const dateSelect = screen.getByLabelText("Date") as HTMLSelectElement;
    const optionLabels = Array.from(dateSelect.options).map((o) => o.textContent);
    expect(optionLabels.some((label) => label?.includes("Monday"))).toBe(true);
    expect(optionLabels.some((label) => label?.includes("Sunday"))).toBe(false);
  });

  it("only offers periods that are scheduled and not already cancelled/replaced", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AbsenceMarkingDialog open onClose={vi.fn()} days={[MONDAY]} />);

    await user.selectOptions(screen.getByLabelText("Date"), "2026-09-14");

    expect(screen.getByText(/Period 1 — Mathematics/)).toBeInTheDocument();
    expect(screen.queryByText(/Period 2 — English Language/)).not.toBeInTheDocument();
  });

  it("submits the chosen date/period/note, then closes", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/calendar/teacher-absences" && opts?.method === "POST") {
        expect(opts.body).toEqual({ date: "2026-09-14", periodIds: ["11111111-1111-1111-1111-111111111111"], note: "Down with malaria" });
        return { id: "abs1", teacherUserId: "t1", teacherName: "Bola Ogundare", date: "2026-09-14", periods: [], note: "Down with malaria", createdAt: "t" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<AbsenceMarkingDialog open onClose={onClose} days={[MONDAY]} />);

    await user.selectOptions(screen.getByLabelText("Date"), "2026-09-14");
    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByLabelText("Note"), "Down with malaria");
    await user.click(screen.getByRole("button", { name: "Mark absent" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("blocks submission with no periods selected (zod), without calling the API", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      throw new Error(`should not be called: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<AbsenceMarkingDialog open onClose={vi.fn()} days={[MONDAY]} />);

    await user.selectOptions(screen.getByLabelText("Date"), "2026-09-14");
    await user.type(screen.getByLabelText("Note"), "Down with malaria");
    await user.click(screen.getByRole("button", { name: "Mark absent" }));

    expect(await screen.findByText("Pick at least one period")).toBeInTheDocument();
  });
});
