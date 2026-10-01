import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Homework, HomeworkSubmissionsView } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest, ApiError } from "../../lib/api-client";
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
  attachments: [{ id: "att1", fileName: "worksheet.pdf", contentType: "application/pdf", sizeBytes: 3 * 1024 * 1024, createdAt: "t" }],
};

const EMPTY_SUBMISSIONS: HomeworkSubmissionsView = { homeworkId: "hw1", students: [] };

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  authStore.clear();
});

describe("HomeworkDetailDialog", () => {
  it("shows existing attachments and the remaining 20MB budget", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/homework/hw1/submissions") return EMPTY_SUBMISSIONS;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<HomeworkDetailDialog open homework={HOMEWORK} onClose={vi.fn()} />);

    expect(await screen.findByText("worksheet.pdf")).toBeInTheDocument();
    expect(screen.getByText("17.0 MB remaining of 20MB for this homework.")).toBeInTheDocument();
  });

  it("shows the Drive-link recommendation once the 20MB cap is reached, with no file input", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/homework/hw1/submissions") return EMPTY_SUBMISSIONS;
      throw new Error(`unexpected call: ${path}`);
    });
    const full: Homework = { ...HOMEWORK, attachments: [{ ...HOMEWORK.attachments[0], sizeBytes: 20 * 1024 * 1024 }] };
    renderWithProviders(<HomeworkDetailDialog open homework={full} onClose={vi.fn()} />);

    expect(await screen.findByText(/reached its 20MB attachment limit/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/attach a file/i)).not.toBeInTheDocument();
  });

  // The centerpiece: the 3-step flow fires in order, and the raw PUT
  // carries X-Goog-Content-Length-Range byte-identical to what the server
  // used to build the signed URL's signature — omitting it fails GCS's
  // signature validation on a real upload, which this mocked fetch can't
  // catch on its own, only THIS assertion on the actual call can.
  it("attach flow: issues the upload URL, PUTs directly to storage with the exact cap header, then commits", async () => {
    const calls: string[] = [];
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      calls.push(`${opts?.method ?? "GET"} ${path}`);
      if (path === "/api/v1/homework/hw1/submissions") return EMPTY_SUBMISSIONS;
      if (path === "/api/v1/homework/hw1/attachments/upload-url" && opts?.method === "POST") {
        expect(opts.body).toEqual({ fileName: "answers.pdf", contentType: "application/pdf" });
        return { uploadUrl: "https://storage.example/upload/xyz", storageKey: "schools/s1/homework/hw1/attachments/xyz-answers.pdf", expiresAt: "t", maxSizeBytes: 17 * 1024 * 1024 };
      }
      if (path === "/api/v1/homework/hw1/attachments" && opts?.method === "POST") {
        expect(opts.body).toEqual({ storageKey: "schools/s1/homework/hw1/attachments/xyz-answers.pdf", fileName: "answers.pdf", contentType: "application/pdf" });
        return { id: "att2", fileName: "answers.pdf", contentType: "application/pdf", sizeBytes: 1024, createdAt: "t" };
      }
      throw new Error(`unexpected call: ${opts?.method ?? "GET"} ${path}`);
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderWithProviders(<HomeworkDetailDialog open homework={HOMEWORK} onClose={vi.fn()} />);
    await screen.findByText("worksheet.pdf");

    const file = new File(["hello"], "answers.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    await waitFor(() => expect(calls).toEqual(["GET /api/v1/homework/hw1/submissions", "POST /api/v1/homework/hw1/attachments/upload-url", "POST /api/v1/homework/hw1/attachments"]));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://storage.example/upload/xyz",
      expect.objectContaining({
        method: "PUT",
        headers: {
          "Content-Type": "application/pdf",
          "X-Goog-Content-Length-Range": "0,17825792",
        },
      }),
    );
  });

  it("a failed direct PUT stops before the commit call and surfaces the specific upload-failed message, not the generic fallback", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === "/api/v1/homework/hw1/submissions") return EMPTY_SUBMISSIONS;
      if (path === "/api/v1/homework/hw1/attachments/upload-url" && opts?.method === "POST") {
        return { uploadUrl: "https://storage.example/upload/xyz", storageKey: "schools/s1/homework/hw1/attachments/xyz-answers.pdf", expiresAt: "t", maxSizeBytes: 17 * 1024 * 1024 };
      }
      throw new Error(`should not be called past the failed PUT: ${opts?.method ?? "GET"} ${path}`);
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const user = userEvent.setup();
    renderWithProviders(<HomeworkDetailDialog open homework={HOMEWORK} onClose={vi.fn()} />);
    await screen.findByText("worksheet.pdf");

    const file = new File(["hello"], "answers.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    expect(await screen.findByText("The file upload failed. Check your connection and try again.")).toBeInTheDocument();
    expect(mockedApiRequest).not.toHaveBeenCalledWith("/api/v1/homework/hw1/attachments", expect.anything());
  });

  it("surfaces the server's over-cap 409 (from the upload-url step) legibly", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === "/api/v1/homework/hw1/submissions") return EMPTY_SUBMISSIONS;
      if (path === "/api/v1/homework/hw1/attachments/upload-url" && opts?.method === "POST") {
        throw new ApiError(409, { statusCode: 409, message: "This homework has already reached its 20MB attachment cap.", error: "Conflict", path, timestamp: "t" });
      }
      throw new Error(`unexpected call: ${opts?.method ?? "GET"} ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<HomeworkDetailDialog open homework={HOMEWORK} onClose={vi.fn()} />);
    await screen.findByText("worksheet.pdf");

    const file = new File(["hello"], "answers.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    expect(await screen.findByText("This homework has already reached its 20MB attachment cap.")).toBeInTheDocument();
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
