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

  it("shows a prompt when no current term is configured", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return { ...TEACHING, currentTermId: null };
      throw new Error(`should not be called: ${path}`);
    });
    renderPage("/homework/arms/arm1?subjectId=sub1");

    expect(await screen.findByText("No current term configured")).toBeInTheDocument();
  });
});
