import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Homework, HomeworkSubmissionsView } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { HomeworkDetailDialog } from "./HomeworkDetailDialog";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const HOMEWORK: Homework = {
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

const EMPTY_SUBMISSIONS: HomeworkSubmissionsView = { homeworkId: "hw1", students: [] };

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

// v0.8.3 step 2 (SPEC_V0.8.3.md §2.2, Item 2) — this dialog is now
// Submissions-only; its own attachment tests (cap display, the 3-step
// attach flow, failed-PUT, over-cap 409) moved to HomeworkFormDialog.test.tsx,
// since that's where the behavior now lives.
describe("HomeworkDetailDialog", () => {
  it("titles the dialog '<homework> — submissions', no mention of attachments", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/homework/hw1/submissions") return EMPTY_SUBMISSIONS;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<HomeworkDetailDialog open homework={HOMEWORK} onClose={vi.fn()} />);

    expect(await screen.findByRole("dialog", { name: "Chapter 3 exercises — submissions" })).toBeInTheDocument();
    expect(screen.queryByText(/attachments/i)).not.toBeInTheDocument();
  });

  // v0.8.3 step 3 — the roster now renders TWICE (CLAUDE.md §6: tables
  // collapse to cards below sm; both the sm:hidden card list and the
  // hidden sm:block table render regardless of viewport in jsdom, same
  // dual-render ClassArmDetailPage.test.tsx already asserts via
  // getAllByText rather than an exact-count getByText.
  it("renders the submissions roster, folding mark-done with uploaded files", async () => {
    const submissions: HomeworkSubmissionsView = {
      homeworkId: "hw1",
      students: [
        { studentId: "s1", studentName: "Chidinma Eze", markedDone: true, markedAt: "t", submissions: [{ id: "sub1", fileName: "answers.pdf", contentType: "application/pdf", sizeBytes: 1024, uploadedAt: "t" }] },
        { studentId: "s2", studentName: "Tunde Bello", markedDone: false, markedAt: null, submissions: [] },
      ],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/homework/hw1/submissions") return submissions;
      throw new Error(`unexpected call: ${path}`);
    });

    renderWithProviders(<HomeworkDetailDialog open homework={HOMEWORK} onClose={vi.fn()} />);

    expect((await screen.findAllByText("Chidinma Eze")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Done").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Tunde Bello").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Not done").length).toBeGreaterThanOrEqual(1);
    // Tunde has no submissions — plain text, not a clickable trigger.
    expect(screen.queryByRole("button", { name: "Tunde Bello" })).not.toBeInTheDocument();
  });

  // Item 5 (SPEC_V0.8.3.md §2.5) — the per-submission detail view: a
  // view-swap within this same dialog, not a nested Dialog.
  it("clicking a student's name opens their detail view with a working download, status, and marked-at timestamp; Back returns to the roster", async () => {
    const submissions: HomeworkSubmissionsView = {
      homeworkId: "hw1",
      students: [
        {
          studentId: "s1",
          studentName: "Chidinma Eze",
          markedDone: true,
          markedAt: "2026-11-02T09:30:00.000Z",
          submissions: [{ id: "sub1", fileName: "answers.pdf", contentType: "application/pdf", sizeBytes: 1024, uploadedAt: "2026-11-01T10:00:00.000Z" }],
        },
        { studentId: "s2", studentName: "Tunde Bello", markedDone: false, markedAt: null, submissions: [] },
      ],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/homework/hw1/submissions") return submissions;
      if (path === "/api/v1/homework/hw1/submissions/sub1/download-url") return { downloadUrl: "https://storage.example/download/sub1", expiresAt: "t" };
      throw new Error(`unexpected call: ${path}`);
    });
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);

    const user = userEvent.setup();
    renderWithProviders(<HomeworkDetailDialog open homework={HOMEWORK} onClose={vi.fn()} />);

    const [nameTrigger] = await screen.findAllByRole("button", { name: "Chidinma Eze" });
    await user.click(nameTrigger);

    expect(screen.getByText("answers.pdf")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Chidinma Eze" })).toBeInTheDocument();
    expect(screen.queryByText("Tunde Bello")).not.toBeInTheDocument(); // roster hidden while viewing

    await user.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(windowOpen).toHaveBeenCalledWith("https://storage.example/download/sub1", "_blank", "noopener,noreferrer"));

    await user.click(screen.getByRole("button", { name: "← Back to all submissions" }));
    expect((await screen.findAllByText("Tunde Bello")).length).toBeGreaterThanOrEqual(1);
  });
});
