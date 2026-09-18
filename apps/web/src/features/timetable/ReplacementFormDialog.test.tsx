import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ReplacementFormDialog } from "./ReplacementFormDialog";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const TEACHER_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  schoolId: "s1",
  email: "teacher3@sunrise.test",
  firstName: "Ahmed",
  lastName: "Suleiman",
  role: "TEACHER",
  status: "ACTIVE",
  lastLoginAt: null,
  staffProfileId: "sp1",
  staffNumber: "SUN/STF/0003",
  jobTitle: "TEACHER",
  phone: null,
  qualification: null,
  dateEmployed: null,
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path === "/api/v1/teachers") return { items: [TEACHER_ROW], total: 1, page: 1, pageSize: 100 };
    if (path === "/api/v1/subjects") return { items: [], total: 0, page: 1, pageSize: 200 };
    throw new Error(`unexpected apiRequest call in beforeEach mock: ${path}`);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("ReplacementFormDialog", () => {
  it("submits the chosen replacement teacher + activity label", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/teachers") return { items: [TEACHER_ROW], total: 1, page: 1, pageSize: 100 };
      if (path === "/api/v1/subjects") return { items: [], total: 0, page: 1, pageSize: 200 };
      if (path === "/api/v1/calendar/timetable-exceptions/exc1" && opts?.method === "PATCH") {
        expect(opts.body).toEqual({ replacementTeacherUserId: "11111111-1111-1111-1111-111111111111", replacementSubjectId: null, activityLabel: "Prep/Study period" });
        return { id: "exc1", type: "REPLACED" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ReplacementFormDialog open onClose={onClose} exceptionId="exc1" periodLabel="Period 1 · JSS 2 A" isReplaced={false} />);

    await screen.findByText("Ahmed Suleiman");
    await user.selectOptions(screen.getByLabelText("Replacement teacher"), "11111111-1111-1111-1111-111111111111");
    await user.type(screen.getByLabelText("Activity label"), "Prep/Study period");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows 'Revert to cancelled' only when already replaced, sending all three fields as null", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/teachers") return { items: [TEACHER_ROW], total: 1, page: 1, pageSize: 100 };
      if (path === "/api/v1/subjects") return { items: [], total: 0, page: 1, pageSize: 200 };
      if (path === "/api/v1/calendar/timetable-exceptions/exc1" && opts?.method === "PATCH") {
        expect(opts.body).toEqual({ replacementTeacherUserId: null, replacementSubjectId: null, activityLabel: null });
        return { id: "exc1", type: "CANCELLED_TEACHER_ABSENT" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ReplacementFormDialog open onClose={onClose} exceptionId="exc1" periodLabel="Period 1 · JSS 2 A" isReplaced />);

    await screen.findByText("Ahmed Suleiman");
    await user.click(screen.getByRole("button", { name: "Revert to cancelled" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("does not show 'Revert to cancelled' when not yet replaced", async () => {
    renderWithProviders(<ReplacementFormDialog open onClose={vi.fn()} exceptionId="exc1" periodLabel="Period 1 · JSS 2 A" isReplaced={false} />);
    await screen.findByText("Ahmed Suleiman");
    expect(screen.queryByRole("button", { name: "Revert to cancelled" })).not.toBeInTheDocument();
  });
});
