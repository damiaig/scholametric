import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Lesson } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest, ApiError } from "../../lib/api-client";
import { LessonFormDialog } from "./LessonFormDialog";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

// StyledDatePicker's own correctness (flatpickr, minDate/maxDate,
// picking a day) is proven once in styled-date-picker.test.tsx — mocked
// here down to a plain native input, same pattern
// HomeworkFormDialog.test.tsx already established. Also captures the
// LAST props this component was rendered with, so this file can assert
// LessonFormDialog actually wires the inverted maxDate="today" (not
// minDate) + the teaching-weekday disableDate fn, without reimplementing
// flatpickr assertions here.
let lastDatePickerProps: { maxDate?: string; minDate?: string; disableDate?: (date: Date) => boolean } | undefined;
vi.mock("../../components/ui/styled-date-picker", () => ({
  StyledDatePicker: ({
    id,
    value,
    onChange,
    placeholder,
    maxDate,
    minDate,
    disableDate,
  }: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    maxDate?: string;
    minDate?: string;
    disableDate?: (date: Date) => boolean;
  }) => {
    lastDatePickerProps = { maxDate, minDate, disableDate };
    return <input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />;
  },
}));

const mockedApiRequest = vi.mocked(apiRequest);

const EXISTING: Lesson = {
  id: "les1",
  classArmId: "arm1",
  subjectId: "sub1",
  teacherUserId: "u1",
  teacherName: "Ms. Adaeze",
  sessionId: "session1",
  title: "Chapter 3: Fractions",
  body: "Covered adding and subtracting fractions.",
  lessonDate: "2026-10-19",
  status: "DRAFT",
  publishedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  attachments: [],
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token" });
  lastDatePickerProps = undefined;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  authStore.clear();
});

describe("LessonFormDialog", () => {
  it("create mode: submits title/body/lessonDate merged with the locked classArmId/subjectId, closes on success", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/lessons/teaching-weekdays") return { weekdays: ["MONDAY", "TUESDAY", "THURSDAY", "FRIDAY"] };
      if (path === "/api/v1/lessons" && opts?.method === "POST") {
        expect(opts.body).toEqual({
          title: "Chapter 4: Decimals",
          body: "Covered converting fractions to decimals.",
          lessonDate: "2026-10-19",
          classArmId: "arm1",
          subjectId: "sub1",
        });
        return { ...EXISTING, id: "new1" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<LessonFormDialog open onClose={onClose} classArmId="arm1" subjectId="sub1" />);

    expect(screen.getByRole("heading", { name: "New lesson" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "Chapter 4: Decimals");
    await user.type(screen.getByLabelText("Body"), "Covered converting fractions to decimals.");
    await user.type(screen.getByLabelText("Lesson date"), "2026-10-19");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // v0.8.4 step 4 (SPEC_V0.8.4.md §3) — the one real inversion: the
  // picker is capped at maxDate="today" (past/today only, never the
  // future), not homework's own minDate="today" (future/today only).
  it("passes maxDate='today' to the picker, not minDate — the inverted date rule", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/lessons/teaching-weekdays") return { weekdays: ["MONDAY", "TUESDAY", "THURSDAY", "FRIDAY"] };
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<LessonFormDialog open onClose={vi.fn()} classArmId="arm1" subjectId="sub1" />);

    await waitFor(() => expect(lastDatePickerProps?.maxDate).toBe("today"));
    expect(lastDatePickerProps?.minDate).toBeUndefined();
  });

  // Same teaching-weekday disable fn shape as homework's own picker,
  // fed by GET /lessons/teaching-weekdays (not /homework/teaching-weekdays).
  it("disables a non-teaching weekday via the fn fed by GET /lessons/teaching-weekdays", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/lessons/teaching-weekdays") return { weekdays: ["MONDAY", "TUESDAY", "THURSDAY", "FRIDAY"] };
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<LessonFormDialog open onClose={vi.fn()} classArmId="arm1" subjectId="sub1" />);

    await waitFor(() => expect(lastDatePickerProps?.disableDate).toBeTypeOf("function"));
    const monday = new Date(2026, 9, 19); // Monday — a teaching weekday
    const wednesday = new Date(2026, 9, 21); // Wednesday — not taught
    expect(lastDatePickerProps?.disableDate?.(monday)).toBe(false);
    expect(lastDatePickerProps?.disableDate?.(wednesday)).toBe(true);
  });

  it("400s a blank title client-side (zod), without calling the API", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/lessons/teaching-weekdays") return { weekdays: [] };
      throw new Error(`should not be called: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<LessonFormDialog open onClose={vi.fn()} classArmId="arm1" subjectId="sub1" />);

    await user.type(screen.getByLabelText("Body"), "Covered converting fractions to decimals.");
    await user.type(screen.getByLabelText("Lesson date"), "2026-10-19");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
  });

  // CLAUDE.md §6: user-facing errors are readable sentences — the
  // backend's 400 (the holiday backstop the picker can't pre-empt) must
  // surface, not be swallowed.
  it("surfaces the server's lesson-date rejection (400) legibly", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === "/api/v1/lessons/teaching-weekdays") return { weekdays: ["MONDAY", "TUESDAY", "THURSDAY", "FRIDAY"] };
      if (path === "/api/v1/lessons" && opts?.method === "POST") {
        throw new ApiError(400, {
          statusCode: 400,
          message: "The lesson date must be a school day you teach this class, on or before today.",
          error: "Bad Request",
          path,
          timestamp: "t",
        });
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<LessonFormDialog open onClose={vi.fn()} classArmId="arm1" subjectId="sub1" />);

    await user.type(screen.getByLabelText("Title"), "Chapter 4: Decimals");
    await user.type(screen.getByLabelText("Body"), "Covered converting fractions to decimals.");
    await user.type(screen.getByLabelText("Lesson date"), "2026-10-19");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("The lesson date must be a school day you teach this class, on or before today.")).toBeInTheDocument();
  });

  it("edit mode: prefills from the given lesson and PATCHes only the form fields", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/lessons/teaching-weekdays") return { weekdays: ["MONDAY", "TUESDAY", "THURSDAY", "FRIDAY"] };
      if (path === "/api/v1/lessons/les1" && opts?.method === "PATCH") {
        expect(opts.body).toEqual({
          title: "Chapter 3: Fractions (revised)",
          body: "Covered adding and subtracting fractions.",
          lessonDate: "2026-10-19",
        });
        return { ...EXISTING, title: "Chapter 3: Fractions (revised)" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<LessonFormDialog open onClose={onClose} classArmId="arm1" subjectId="sub1" lesson={EXISTING} />);

    expect(screen.getByRole("heading", { name: "Edit lesson" })).toBeInTheDocument();
    const titleInput = screen.getByLabelText("Title") as HTMLInputElement;
    await waitFor(() => expect(titleInput).toHaveValue("Chapter 3: Fractions"));

    await user.clear(titleInput);
    await user.type(titleInput, "Chapter 3: Fractions (revised)");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // v0.8.4 step 4 — the create-then-attach-on-submit ordering, mirrored
  // from HomeworkFormDialog's own identical test.
  it("create mode: holds a selected file until after create succeeds, then attaches it and closes", async () => {
    const calls: string[] = [];
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      calls.push(`${opts?.method ?? "GET"} ${path}`);
      if (path === "/api/v1/lessons/teaching-weekdays") {
        return { weekdays: ["MONDAY", "TUESDAY", "THURSDAY", "FRIDAY"] };
      }
      if (path === "/api/v1/lessons" && opts?.method === "POST") {
        return { ...EXISTING, id: "new1" };
      }
      if (path === "/api/v1/lessons/new1/attachments/upload-url" && opts?.method === "POST") {
        return { uploadUrl: "https://storage.example/upload/xyz", storageKey: "schools/s1/lessons/new1/attachments/xyz-notes.pdf", expiresAt: "t", maxSizeBytes: 20 * 1024 * 1024 };
      }
      if (path === "/api/v1/lessons/new1/attachments" && opts?.method === "POST") {
        return { id: "att1", fileName: "notes.pdf", contentType: "application/pdf", sizeBytes: 1024, createdAt: "t" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<LessonFormDialog open onClose={onClose} classArmId="arm1" subjectId="sub1" />);

    await user.type(screen.getByLabelText("Title"), "Chapter 4: Decimals");
    await user.type(screen.getByLabelText("Body"), "Covered converting fractions to decimals.");
    await user.type(screen.getByLabelText("Lesson date"), "2026-10-19");

    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    expect(screen.getAllByText("notes.pdf").length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toEqual([
      "GET /api/v1/lessons/teaching-weekdays",
      "POST /api/v1/lessons",
      "POST /api/v1/lessons/new1/attachments/upload-url",
      "POST /api/v1/lessons/new1/attachments",
    ]);
  });

  it("edit mode: shows existing attachments and attaches a newly selected file immediately, without a create call", async () => {
    const withAttachment: Lesson = {
      ...EXISTING,
      attachments: [{ id: "att0", fileName: "existing.pdf", contentType: "application/pdf", sizeBytes: 2048, createdAt: "t" }],
    };
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === "/api/v1/lessons/teaching-weekdays") return { weekdays: ["MONDAY", "TUESDAY", "THURSDAY", "FRIDAY"] };
      if (path === "/api/v1/lessons/les1/attachments/upload-url" && opts?.method === "POST") {
        return { uploadUrl: "https://storage.example/upload/xyz", storageKey: "schools/s1/lessons/les1/attachments/xyz-new.pdf", expiresAt: "t", maxSizeBytes: 20 * 1024 * 1024 };
      }
      if (path === "/api/v1/lessons/les1/attachments" && opts?.method === "POST") {
        return { id: "att1", fileName: "new.pdf", contentType: "application/pdf", sizeBytes: 1024, createdAt: "t" };
      }
      if (path === "/api/v1/lessons" || path.startsWith("/api/v1/lessons?")) {
        throw new Error(`a create call should not happen in edit mode: ${path} ${opts?.method ?? "GET"}`);
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const user = userEvent.setup();
    renderWithProviders(<LessonFormDialog open onClose={vi.fn()} classArmId="arm1" subjectId="sub1" lesson={withAttachment} />);

    expect(screen.getByText("existing.pdf")).toBeInTheDocument();

    const file = new File(["hello"], "new.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    await waitFor(() => expect(screen.getAllByText("new.pdf").length).toBeGreaterThanOrEqual(2));
  });

  it("edit mode: deletes an existing attachment via the confirm dialog, removing it from the list", async () => {
    const withAttachment: Lesson = {
      ...EXISTING,
      attachments: [{ id: "att0", fileName: "existing.pdf", contentType: "application/pdf", sizeBytes: 2048, createdAt: "t" }],
    };
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === "/api/v1/lessons/teaching-weekdays") return { weekdays: ["MONDAY", "TUESDAY", "THURSDAY", "FRIDAY"] };
      if (path === "/api/v1/lessons/les1/attachments/att0" && opts?.method === "DELETE") {
        return { id: "att0" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<LessonFormDialog open onClose={vi.fn()} classArmId="arm1" subjectId="sub1" lesson={withAttachment} />);

    expect(screen.getByText("existing.pdf")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete existing.pdf" }));
    expect(screen.getByText("Delete attachment")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("existing.pdf")).not.toBeInTheDocument());
  });
});
