import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassTimetableResponse, MyChildrenResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { MyTimetablePage } from "./MyTimetablePage";
import { addWeeks, getAgendaRange, getCurrentWeekRange } from "./current-week-range";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

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

function response(className: string): ClassTimetableResponse {
  return {
    classArmId: "arm1",
    className,
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
  it("STUDENT: defaults to the Agenda tab, no child-switcher, no GET /calendar/periods call", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return STUDENT_USER;
      if (path === "/api/v1/me/timetable") return response("JSS 2 A");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyTimetablePage />);

    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
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
    await screen.findByText("Today");

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
    await screen.findByText("Today");
    await user.click(screen.getByRole("tab", { name: "Full week" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your timetable.")).not.toBeInTheDocument();
  });

  // v0.8 walk-found fix — no prev/next week control existed at all before
  // this. ONE shared weekOffset drives both tabs' ranges.
  it("STUDENT: week navigation shifts the requested range by 7 days, shared across tabs; Today resets", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const requestedRanges: { from: string; to: string }[] = [];
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, string | number | undefined> }) => {
      if (path.includes("/auth/me")) return STUDENT_USER;
      if (path === "/api/v1/me/timetable") {
        if (opts?.query) requestedRanges.push({ from: String(opts.query.from), to: String(opts.query.to) });
        return response("JSS 2 A");
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<MyTimetablePage />);
    await screen.findByText("Today");

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

  it("PARENT: week navigation shifts the selected child's requested range by 7 days, shared across tabs", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const requestedRanges: { from: string; to: string }[] = [];
    mockedApiRequest.mockImplementation(async (path: string, opts?: { query?: Record<string, string | number | undefined> }) => {
      if (path.includes("/auth/me")) return PARENT_USER;
      if (path === "/api/v1/me/children") return CHILDREN;
      if (path === "/api/v1/me/children/child1/timetable") {
        if (opts?.query) requestedRanges.push({ from: String(opts.query.from), to: String(opts.query.to) });
        return response("JSS 2 A");
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const user = userEvent.setup();

    renderWithProviders(<MyTimetablePage />);
    await screen.findByText("Mathematics");

    const thisWeekAgenda = getAgendaRange(addWeeks(new Date(), 0));
    const thisWeekGrid = getCurrentWeekRange(addWeeks(new Date(), 0));
    await waitFor(() => expect(requestedRanges).toContainEqual(thisWeekAgenda));
    expect(requestedRanges).toContainEqual(thisWeekGrid);

    await user.click(screen.getByRole("button", { name: "Next week" }));
    const nextWeekAgenda = getAgendaRange(addWeeks(new Date(), 1));
    const nextWeekGrid = getCurrentWeekRange(addWeeks(new Date(), 1));
    await waitFor(() => expect(requestedRanges).toContainEqual(nextWeekAgenda));
    expect(requestedRanges).toContainEqual(nextWeekGrid);
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
