import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentHomeworkEntry, StudentHomeworkListResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { MyHomeworkPage } from "./MyHomeworkPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const BASE_USER = {
  id: "u1",
  email: null,
  firstName: "Chidi",
  lastName: "Okafor",
  status: "ACTIVE",
  lastLoginAt: null,
  mustChangePassword: false,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

function entry(overrides: Partial<StudentHomeworkEntry> = {}): StudentHomeworkEntry {
  return {
    id: "hw1",
    subjectId: "sub1",
    subjectName: "Mathematics",
    teacherName: "Ms. Adaeze",
    title: "Chapter 3 exercises",
    description: "Solve all questions at the end of the chapter.",
    dueDate: "2026-11-02",
    requiresUpload: false,
    markedDone: false,
    markedAt: null,
    attachments: [],
    submissions: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  authStore.clear();
});

describe("MyHomeworkPage", () => {
  it("STUDENT: renders due-date-grouped homework with subject/title/badge, and 'View more' for a long description", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const longDescription = "Read the assigned chapter carefully. ".repeat(10);
    const list: StudentHomeworkListResponse = {
      classArmId: "arm1",
      homework: [entry({ description: longDescription })],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/homework")) return list;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MyHomeworkPage />);

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Chapter 3 exercises")).toBeInTheDocument();
    expect(screen.getByText("Non fait")).toBeInTheDocument();
    expect(screen.getByText(/Due Monday/)).toBeInTheDocument();

    const viewMore = screen.getByRole("button", { name: "View more" });
    await user.click(viewMore);
    expect(screen.getByRole("heading", { name: "Chapter 3 exercises" })).toBeInTheDocument();
  });

  it("STUDENT: mark-done flips Fait/Non fait via POST /me/homework/:id/complete", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const list: StudentHomeworkListResponse = { classArmId: "arm1", homework: [entry()] };
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path === "/api/v1/me/homework" && (!opts?.method || opts.method === "GET")) return list;
      if (path === "/api/v1/me/homework/hw1/complete" && opts?.method === "POST") {
        expect(opts.body).toEqual({ markedDone: true });
        return { homeworkId: "hw1", markedDone: true, markedAt: "2026-10-01T00:00:00.000Z" };
      }
      throw new Error(`unexpected apiRequest call: ${opts?.method ?? "GET"} ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MyHomeworkPage />);

    const checkbox = await screen.findByRole("checkbox", { name: "J'ai terminé" });
    await user.click(checkbox);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/me/homework/hw1/complete", { method: "POST", body: { markedDone: true } }));
  });

  it("STUDENT: the upload flow issues the URL, PUTs directly to storage with the cap header, then commits", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const list: StudentHomeworkListResponse = { classArmId: "arm1", homework: [entry({ requiresUpload: true })] };
    const calls: string[] = [];
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      calls.push(`${opts?.method ?? "GET"} ${path}`);
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path === "/api/v1/me/homework" && (!opts?.method || opts.method === "GET")) return list;
      if (path === "/api/v1/me/homework/hw1/submissions/upload-url" && opts?.method === "POST") {
        return { uploadUrl: "https://storage.example/upload/xyz", storageKey: "schools/s1/homework/hw1/submissions/st1/xyz-answers.pdf", expiresAt: "t", maxSizeBytes: 20 * 1024 * 1024 };
      }
      if (path === "/api/v1/me/homework/hw1/submissions" && opts?.method === "POST") {
        expect(opts.body).toEqual({ storageKey: "schools/s1/homework/hw1/submissions/st1/xyz-answers.pdf", fileName: "answers.pdf", contentType: "application/pdf" });
        return { id: "sub1", fileName: "answers.pdf", contentType: "application/pdf", sizeBytes: 1024, uploadedAt: "t" };
      }
      throw new Error(`unexpected apiRequest call: ${opts?.method ?? "GET"} ${path}`);
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderWithProviders(<MyHomeworkPage />);
    await screen.findByText("Chapter 3 exercises");

    const file = new File(["hello"], "answers.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    await waitFor(() =>
      expect(calls).toEqual(
        expect.arrayContaining(["POST /api/v1/me/homework/hw1/submissions/upload-url", "POST /api/v1/me/homework/hw1/submissions"]),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storage.example/upload/xyz",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/pdf", "X-Goog-Content-Length-Range": "0,20971520" },
      }),
    );
  });

  it("STUDENT: a failed direct PUT surfaces the specific upload-failed message, not the generic fallback", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const list: StudentHomeworkListResponse = { classArmId: "arm1", homework: [entry({ requiresUpload: true })] };
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path === "/api/v1/me/homework" && (!opts?.method || opts.method === "GET")) return list;
      if (path === "/api/v1/me/homework/hw1/submissions/upload-url" && opts?.method === "POST") {
        return { uploadUrl: "https://storage.example/upload/xyz", storageKey: "schools/s1/homework/hw1/submissions/st1/xyz-answers.pdf", expiresAt: "t", maxSizeBytes: 20 * 1024 * 1024 };
      }
      throw new Error(`should not be called past the failed PUT: ${opts?.method ?? "GET"} ${path}`);
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const user = userEvent.setup();
    renderWithProviders(<MyHomeworkPage />);
    await screen.findByText("Chapter 3 exercises");

    const file = new File(["hello"], "answers.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    expect(await screen.findByText("The file upload failed. Check your connection and try again.")).toBeInTheDocument();
  });

  it("PARENT: shows a linked child's homework read-only — no mark-done checkbox, no file input", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const list: StudentHomeworkListResponse = {
      classArmId: "arm1",
      homework: [entry({ requiresUpload: true })],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "PARENT" };
      if (path.includes("/me/children/child-1/homework")) return list;
      if (path.includes("/me/children")) return { children: [{ studentId: "child-1", firstName: "Kemi", lastName: "Okafor", currentClassArmLabel: "JSS 1 A" }] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyHomeworkPage />);

    expect(await screen.findByText("Chapter 3 exercises")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Child" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  // v0.8.2 step 7 (SPEC_V0.8.2.md §6 item 7) — inverts Step 6's own proof:
  // the parent's attachment is now a clickable download link (Step 6 had
  // no parent-scoped endpoint to wire, so it rendered as plain text).
  it("PARENT: downloads a linked child's homework attachment via the parent-scoped endpoint", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const list: StudentHomeworkListResponse = {
      classArmId: "arm1",
      homework: [entry({ attachments: [{ id: "att1", fileName: "worksheet.pdf", contentType: "application/pdf", sizeBytes: 1024, createdAt: "t" }] })],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "PARENT" };
      if (path === "/api/v1/me/children/child-1/homework/hw1/attachments/att1/download-url") {
        return { downloadUrl: "https://storage.example/download/att1", expiresAt: "t" };
      }
      if (path.includes("/me/children/child-1/homework")) return list;
      if (path.includes("/me/children")) return { children: [{ studentId: "child-1", firstName: "Kemi", lastName: "Okafor", currentClassArmLabel: "JSS 1 A" }] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);

    const user = userEvent.setup();
    renderWithProviders(<MyHomeworkPage />);

    const downloadButton = await screen.findByRole("button", { name: /worksheet.pdf/ });
    await user.click(downloadButton);

    await waitFor(() => expect(windowOpen).toHaveBeenCalledWith("https://storage.example/download/att1", "_blank", "noopener,noreferrer"));
  });

  it("PARENT: no children linked shows the empty state without querying homework", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "PARENT" };
      if (path.includes("/me/children")) return { children: [] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyHomeworkPage />);

    expect(await screen.findByText("No children linked to your account yet.")).toBeInTheDocument();
  });
});
