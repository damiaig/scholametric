import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Homework } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest, ApiError } from "../../lib/api-client";
import { HomeworkFormDialog } from "./HomeworkFormDialog";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

// StyledDatePicker's own correctness (flatpickr, minDate, picking a day)
// is proven once in styled-date-picker.test.tsx — mocked here down to a
// plain native input forwarding value/onChange faithfully, same pattern
// HolidaysSection.test.tsx already established (real flatpickr is
// readOnly and can't be typed into directly in jsdom).
vi.mock("../../components/ui/styled-date-picker", () => ({
  StyledDatePicker: ({
    id,
    value,
    onChange,
    placeholder,
  }: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => <input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />,
}));

const mockedApiRequest = vi.mocked(apiRequest);

const EXISTING: Homework = {
  id: "hw1",
  classArmId: "arm1",
  subjectId: "sub1",
  teacherUserId: "u1",
  teacherName: "Ms. Adaeze",
  sessionId: "session1",
  termId: "term1",
  title: "Chapter 3 exercises",
  description: "Solve all questions.",
  dueDate: "2026-11-02",
  requiresUpload: false,
  status: "DRAFT",
  publishedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  attachments: [],
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("HomeworkFormDialog", () => {
  it("create mode: submits title/description/dueDate/requiresUpload merged with the locked classArmId/subjectId/termId, closes on success", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/homework" && opts?.method === "POST") {
        expect(opts.body).toEqual({
          title: "Chapter 4 exercises",
          description: "Read pages 10-20.",
          dueDate: "2026-11-09",
          requiresUpload: true,
          classArmId: "arm1",
          subjectId: "sub1",
          termId: "term1",
        });
        return { ...EXISTING, id: "new1" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<HomeworkFormDialog open onClose={onClose} classArmId="arm1" subjectId="sub1" termId="term1" />);

    expect(screen.getByRole("heading", { name: "New homework" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "Chapter 4 exercises");
    await user.type(screen.getByLabelText("Description"), "Read pages 10-20.");
    await user.type(screen.getByLabelText("Due date"), "2026-11-09");
    await user.click(screen.getByLabelText("Requires a file upload from students"));
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("400s a blank title client-side (zod), without calling the API", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      throw new Error(`should not be called: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<HomeworkFormDialog open onClose={vi.fn()} classArmId="arm1" subjectId="sub1" termId="term1" />);

    await user.type(screen.getByLabelText("Description"), "Read pages 10-20.");
    await user.type(screen.getByLabelText("Due date"), "2026-11-09");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
  });

  // CLAUDE.md §6: user-facing errors are readable sentences — a 400 from
  // the server's own school-day validation must surface, not be swallowed.
  it("surfaces the server's due-date rejection (400) legibly", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === "/api/v1/homework" && opts?.method === "POST") {
        throw new ApiError(400, {
          statusCode: 400,
          message: "The due date must be a school day for this class.",
          error: "Bad Request",
          path,
          timestamp: "t",
        });
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<HomeworkFormDialog open onClose={vi.fn()} classArmId="arm1" subjectId="sub1" termId="term1" />);

    await user.type(screen.getByLabelText("Title"), "Chapter 4 exercises");
    await user.type(screen.getByLabelText("Description"), "Read pages 10-20.");
    await user.type(screen.getByLabelText("Due date"), "2026-11-08");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("The due date must be a school day for this class.")).toBeInTheDocument();
  });

  it("edit mode: prefills from the given homework and PATCHes only the form fields", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/homework/hw1" && opts?.method === "PATCH") {
        expect(opts.body).toEqual({
          title: "Chapter 3 exercises (revised)",
          description: "Solve all questions.",
          dueDate: "2026-11-02",
          requiresUpload: false,
        });
        return { ...EXISTING, title: "Chapter 3 exercises (revised)" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <HomeworkFormDialog open onClose={onClose} classArmId="arm1" subjectId="sub1" termId="term1" homework={EXISTING} />,
    );

    expect(screen.getByRole("heading", { name: "Edit homework" })).toBeInTheDocument();
    const titleInput = screen.getByLabelText("Title") as HTMLInputElement;
    await waitFor(() => expect(titleInput).toHaveValue("Chapter 3 exercises"));

    await user.clear(titleInput);
    await user.type(titleInput, "Chapter 3 exercises (revised)");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
