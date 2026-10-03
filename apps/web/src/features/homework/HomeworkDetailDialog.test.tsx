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

  it("renders the submissions roster, folding mark-done with uploaded files; clicking a file opens its download URL", async () => {
    const submissions: HomeworkSubmissionsView = {
      homeworkId: "hw1",
      students: [
        { studentId: "s1", studentName: "Chidinma Eze", markedDone: true, markedAt: "t", submissions: [{ id: "sub1", fileName: "answers.pdf", contentType: "application/pdf", sizeBytes: 1024, uploadedAt: "t" }] },
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

    expect(await screen.findByText("Chidinma Eze")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Tunde Bello")).toBeInTheDocument();
    expect(screen.getByText("Not done")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /answers.pdf/ }));
    await waitFor(() => expect(windowOpen).toHaveBeenCalledWith("https://storage.example/download/sub1", "_blank", "noopener,noreferrer"));
  });
});
