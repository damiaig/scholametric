import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Lesson, LessonListResponse, MyTeaching } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { LessonClassPage } from "./LessonClassPage";

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

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: "les1",
    classArmId: "arm1",
    subjectId: "sub1",
    teacherUserId: "u1",
    teacherName: "Ms. Adaeze",
    sessionId: "sess1",
    title: "Chapter 3: Fractions",
    body: "Covered adding and subtracting fractions.",
    lessonDate: "2026-10-19",
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
      <Route path="/lessons/arms/:id" element={<LessonClassPage />} />
    </Routes>,
    { route },
  );
}

describe("LessonClassPage", () => {
  it("renders the class+subject title and the lesson list", async () => {
    const list: LessonListResponse = { classArmId: "arm1", subjectId: "sub1", lessons: [lesson()] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/lessons") return list;
      throw new Error(`unexpected call: ${path}`);
    });
    renderPage("/lessons/arms/arm1?subjectId=sub1");

    expect(await screen.findByText("JSS 1 A — Mathematics")).toBeInTheDocument();
    expect(await screen.findByText("Chapter 3: Fractions")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("shows a non-relative lesson date in weekday-day-month form", async () => {
    const list: LessonListResponse = { classArmId: "arm1", subjectId: "sub1", lessons: [lesson({ lessonDate: "2026-10-19" })] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/lessons") return list;
      throw new Error(`unexpected call: ${path}`);
    });
    renderPage("/lessons/arms/arm1?subjectId=sub1");

    expect(await screen.findByText("Monday 19 October")).toBeInTheDocument();
  });

  // Computed from the real current date, not a fixed fixture + fake
  // timers — same convention HomeworkClassPage.test.tsx already uses.
  it("shows 'Today' for a lesson dated today", async () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const list: LessonListResponse = { classArmId: "arm1", subjectId: "sub1", lessons: [lesson({ lessonDate: todayStr })] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/lessons") return list;
      throw new Error(`unexpected call: ${path}`);
    });
    renderPage("/lessons/arms/arm1?subjectId=sub1");

    expect(await screen.findByText("Today")).toBeInTheDocument();
  });

  it("links back to /lessons", async () => {
    const list: LessonListResponse = { classArmId: "arm1", subjectId: "sub1", lessons: [] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/lessons") return list;
      throw new Error(`unexpected call: ${path}`);
    });
    renderPage("/lessons/arms/arm1?subjectId=sub1");

    await screen.findByText("JSS 1 A — Mathematics");
    expect(screen.getByRole("link", { name: "Back to Lessons" })).toHaveAttribute("href", "/lessons");
  });

  it("publishes a DRAFT lesson", async () => {
    const list: LessonListResponse = { classArmId: "arm1", subjectId: "sub1", lessons: [lesson()] };
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/lessons") return list;
      if (path === "/api/v1/lessons/les1/publish" && opts?.method === "POST") return lesson({ status: "PUBLISHED", publishedAt: "t" });
      throw new Error(`unexpected call: ${opts?.method ?? "GET"} ${path}`);
    });
    const user = userEvent.setup();
    renderPage("/lessons/arms/arm1?subjectId=sub1");

    await screen.findByText("Chapter 3: Fractions");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/lessons/les1/publish", { method: "POST" }));
  });

  it("disables Edit and Delete once PUBLISHED, with an explanatory title", async () => {
    const list: LessonListResponse = { classArmId: "arm1", subjectId: "sub1", lessons: [lesson({ status: "PUBLISHED", publishedAt: "t" })] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/lessons") return list;
      throw new Error(`unexpected call: ${path}`);
    });
    renderPage("/lessons/arms/arm1?subjectId=sub1");

    await screen.findByText("Chapter 3: Fractions");
    const editButton = screen.getByRole("button", { name: "Edit Chapter 3: Fractions" });
    const deleteButton = screen.getByRole("button", { name: "Delete Chapter 3: Fractions" });
    expect(editButton).toBeDisabled();
    expect(editButton).toHaveAttribute("title", "Unpublish first to edit");
    expect(deleteButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeEnabled();
  });

  // No Submissions button anywhere on this page — there's no roster/
  // per-student state to show for a read-only Lesson. Confirmed absent,
  // not just "not clicked".
  it("has no Submissions button — Lessons are read-only, no roster view exists", async () => {
    const list: LessonListResponse = { classArmId: "arm1", subjectId: "sub1", lessons: [lesson()] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/lessons") return list;
      throw new Error(`unexpected call: ${path}`);
    });
    renderPage("/lessons/arms/arm1?subjectId=sub1");

    await screen.findByText("Chapter 3: Fractions");
    expect(screen.queryByRole("button", { name: "Submissions" })).not.toBeInTheDocument();
  });

  it("shows a prompt instead of querying when no subjectId is in the URL", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      throw new Error(`should not be called: ${path}`);
    });
    renderPage("/lessons/arms/arm1");

    expect(await screen.findByText("No subject selected")).toBeInTheDocument();
  });

  it("deletes a DRAFT lesson", async () => {
    const list: LessonListResponse = { classArmId: "arm1", subjectId: "sub1", lessons: [lesson()] };
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === "/api/v1/me/teaching") return TEACHING;
      if (path === "/api/v1/lessons") return list;
      if (path === "/api/v1/lessons/les1" && opts?.method === "DELETE") return { id: "les1" };
      throw new Error(`unexpected call: ${opts?.method ?? "GET"} ${path}`);
    });
    const user = userEvent.setup();
    renderPage("/lessons/arms/arm1?subjectId=sub1");

    await screen.findByText("Chapter 3: Fractions");
    await user.click(screen.getByRole("button", { name: "Delete Chapter 3: Fractions" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/lessons/les1", { method: "DELETE" }));
  });
});
