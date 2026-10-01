import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Homework, HomeworkListResponse, MyTeaching } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { HomeworkClassPage } from "./HomeworkClassPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const TEACHING: MyTeaching = {
  classTeacherOf: [],
  subjects: [{ id: "sa1", subjectId: "sub1", subjectName: "Mathematics", classArmId: "arm1", className: "JSS 1 A" }],
  currentSessionId: "sess1",
  currentTermId: "term1",
  currentTermName: "FIRST",
};

function homework(overrides: Partial<Homework> = {}): Homework {
  return {
    id: "hw1",
    classArmId: "arm1",
    subjectId: "sub1",
    teacherUserId: "u1",
    teacherName: "Ms. Adaeze",
    sessionId: "sess1",
    termId: "term1",
    title: "Chapter 3 exercises",
    description: "Solve all questions.",
    dueDate: "2026-11-02",
    requiresUpload: false,
    status: "DRAFT",
    publishedAt: null,
    createdAt: "t",
    updatedAt: "t",
    attachments: [],
    ...overrides,
  };
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  authStore.clear();
});

function renderPage(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/homework/arms/:id" element={<HomeworkClassPage />} />
    </Routes>,
    { route },
  );
}

describe("HomeworkClassPage", () => {
  it("renders the class+subject title and the homework list", async () => {
    const list: HomeworkListResponse = { classArmId: "arm1", subjectId: "sub1", termId: "term1", homework: [homework()] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/homework") return list;
      throw new Error(`unexpected call: ${path}`);
    });
    renderPage("/homework/arms/arm1?subjectId=sub1");

    expect(await screen.findByText("JSS 1 A — Mathematics")).toBeInTheDocument();
    expect(await screen.findByText("Chapter 3 exercises")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("publishes a DRAFT homework", async () => {
    const list: HomeworkListResponse = { classArmId: "arm1", subjectId: "sub1", termId: "term1", homework: [homework()] };
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/homework") return list;
      if (path === "/api/v1/homework/hw1/publish" && opts?.method === "POST") return homework({ status: "PUBLISHED", publishedAt: "t" });
      throw new Error(`unexpected call: ${opts?.method ?? "GET"} ${path}`);
    });
    const user = userEvent.setup();
    renderPage("/homework/arms/arm1?subjectId=sub1");

    await screen.findByText("Chapter 3 exercises");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/homework/hw1/publish", { method: "POST" }));
  });

  it("disables Edit and Delete once PUBLISHED, with an explanatory title", async () => {
    const list: HomeworkListResponse = { classArmId: "arm1", subjectId: "sub1", termId: "term1", homework: [homework({ status: "PUBLISHED", publishedAt: "t" })] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/homework") return list;
      throw new Error(`unexpected call: ${path}`);
    });
    renderPage("/homework/arms/arm1?subjectId=sub1");

    await screen.findByText("Chapter 3 exercises");
    const editButton = screen.getByRole("button", { name: "Edit Chapter 3 exercises" });
    const deleteButton = screen.getByRole("button", { name: "Delete Chapter 3 exercises" });
    expect(editButton).toBeDisabled();
    expect(editButton).toHaveAttribute("title", "Unpublish first to edit");
    expect(deleteButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeEnabled();
  });

  it("shows a prompt instead of querying when no subjectId is in the URL", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      throw new Error(`should not be called: ${path}`);
    });
    renderPage("/homework/arms/arm1");

    expect(await screen.findByText("No subject selected")).toBeInTheDocument();
  });

  // v0.8.2 bugfix pass — the actual bug: HomeworkClassPage used to store the
  // clicked item as a frozen object (`detail`), so the already-open dialog
  // kept rendering the PRE-upload attachments array even after the list's
  // own query invalidation refetched fresh data underneath it. The fix
  // derives the dialog's homework prop fresh from the live list every
  // render (`homework.find(item => item.id === detailId)`), so this proves
  // the new attachment appears WITHOUT closing the dialog.
  it("a newly attached file appears in the open dialog without closing it", async () => {
    let attached = false;
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/homework" && (!opts?.method || opts.method === "GET")) {
        return {
          classArmId: "arm1",
          subjectId: "sub1",
          termId: "term1",
          homework: [
            homework({
              attachments: attached
                ? [{ id: "att1", fileName: "worksheet.pdf", contentType: "application/pdf", sizeBytes: 1024, createdAt: "t" }]
                : [],
            }),
          ],
        };
      }
      if (path === "/api/v1/homework/hw1/submissions") return { homeworkId: "hw1", students: [] };
      if (path === "/api/v1/homework/hw1/attachments/upload-url" && opts?.method === "POST") {
        return {
          uploadUrl: "https://storage.example/upload/xyz",
          storageKey: "schools/s1/homework/hw1/attachments/xyz-worksheet.pdf",
          expiresAt: "t",
          maxSizeBytes: 20 * 1024 * 1024,
        };
      }
      if (path === "/api/v1/homework/hw1/attachments" && opts?.method === "POST") {
        attached = true;
        return { id: "att1", fileName: "worksheet.pdf", contentType: "application/pdf", sizeBytes: 1024, createdAt: "t" };
      }
      throw new Error(`unexpected call: ${opts?.method ?? "GET"} ${path}`);
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const user = userEvent.setup();
    renderPage("/homework/arms/arm1?subjectId=sub1");

    await screen.findByText("Chapter 3 exercises");
    await user.click(screen.getByRole("button", { name: "Attachments & submissions" }));
    expect(screen.queryByText("worksheet.pdf")).not.toBeInTheDocument();

    const file = new File(["hello"], "worksheet.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    expect(await screen.findByText("worksheet.pdf")).toBeInTheDocument();
  });

  it("shows a prompt when no current term is configured", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return { ...TEACHING, currentTermId: null };
      throw new Error(`should not be called: ${path}`);
    });
    renderPage("/homework/arms/arm1?subjectId=sub1");

    expect(await screen.findByText("No current term configured")).toBeInTheDocument();
  });
});
