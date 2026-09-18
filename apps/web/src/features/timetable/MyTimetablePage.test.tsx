import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassTimetableResponse, MyChildrenResponse, Period } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { MyTimetablePage } from "./MyTimetablePage";

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

const PERIOD_1: Period = { id: "p1", schoolId: "s1", name: "Period 1", startsAt: "08:00", endsAt: "08:45", sortOrder: 1, createdAt: "t", updatedAt: "t" };

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
  it("STUDENT: renders own class's resolved week, no child-switcher", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return STUDENT_USER;
      if (path === "/api/v1/calendar/periods") return [PERIOD_1];
      if (path === "/api/v1/me/timetable") return response("JSS 2 A");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyTimetablePage />);

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByLabelText("Child")).not.toBeInTheDocument();
  });

  it("PARENT: shows the child-switcher, defaults to the first child, and loads that child's timetable", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return PARENT_USER;
      if (path === "/api/v1/me/children") return CHILDREN;
      if (path === "/api/v1/calendar/periods") return [PERIOD_1];
      if (path === "/api/v1/me/children/child1/timetable") return response("JSS 2 A");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyTimetablePage />);

    expect(await screen.findByLabelText("Child")).toBeInTheDocument();
    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
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
      if (path === "/api/v1/calendar/periods") return [PERIOD_1];
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
