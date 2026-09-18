import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TeacherAbsenceRow } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { AbsencesPage } from "./AbsencesPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const ABSENCE: TeacherAbsenceRow = {
  id: "abs1",
  teacherUserId: "t1",
  teacherName: "Bola Ogundare",
  date: "2026-09-14",
  periods: [{ periodId: "p1", periodName: "Period 1", classArmId: "arm1", className: "JSS 2 A", exceptionId: "exc1", status: "CANCELLED" }],
  note: "Down with malaria",
  createdAt: "2026-09-14T00:00:00.000Z",
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("AbsencesPage", () => {
  it("renders each absence with its note and per-period Replace action", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/teacher-absences") return [ABSENCE];
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<AbsencesPage />);

    expect(await screen.findByText("Bola Ogundare")).toBeInTheDocument();
    expect(screen.getByText(/Down with malaria/)).toBeInTheDocument();
    expect(screen.getByText("Period 1 · JSS 2 A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
  });

  it("shows an empty state when there are no absences", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/teacher-absences") return [];
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<AbsencesPage />);
    expect(await screen.findByText("No teacher absences recorded this week.")).toBeInTheDocument();
  });

  it("shows an error state with retry when absences fail to load", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/teacher-absences") throw new Error("boom");
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<AbsencesPage />);
    expect(await screen.findByText("Couldn't load absences.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("opens the replacement dialog for the clicked period", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/teacher-absences") return [ABSENCE];
      if (path === "/api/v1/teachers") return { items: [], total: 0, page: 1, pageSize: 100 };
      if (path === "/api/v1/subjects") return { items: [], total: 0, page: 1, pageSize: 200 };
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<AbsencesPage />);

    await user.click(await screen.findByRole("button", { name: "Replace" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Replace cancelled period" })).toBeInTheDocument());
  });
});
