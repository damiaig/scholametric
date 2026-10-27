import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentLessonEntry, StudentLessonListResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { MyLessonsPage } from "./MyLessonsPage";

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

function entry(overrides: Partial<StudentLessonEntry> = {}): StudentLessonEntry {
  return {
    id: "les1",
    subjectId: "sub1",
    subjectName: "Mathematics",
    teacherName: "Ms. Adaeze",
    title: "Chapter 3: Fractions",
    body: "Covered adding and subtracting fractions.",
    lessonDate: "2026-10-19",
    attachments: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  authStore.clear();
});

describe("MyLessonsPage", () => {
  it("STUDENT: renders lesson-date-grouped list with subject/title/body, relative date, and 'View more' for a long body", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const longBody = "We covered fraction addition carefully. ".repeat(10);
    const list: StudentLessonListResponse = {
      classArmId: "arm1",
      lessons: [entry({ body: longBody })],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/lessons")) return list;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MyLessonsPage />);

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Chapter 3: Fractions")).toBeInTheDocument();
    // Bare relative date, no "Due"/"Logged" prefix (ruled at plan time).
    expect(screen.getByText("Monday 19 October")).toBeInTheDocument();

    const viewMore = screen.getByRole("button", { name: "View more" });
    await user.click(viewMore);
    expect(screen.getByRole("heading", { name: "Chapter 3: Fractions" })).toBeInTheDocument();
  });

  // The four-level structural read-only guarantee, checked at the DOM
  // level: no mark-done checkbox, no upload control, no "requires
  // upload"/"submissions" text anywhere — because none of that exists
  // for a Lesson at all, not because it's hidden.
  it("STUDENT: no mark-done checkbox and no upload control exist — Lessons are read-only, structurally", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const list: StudentLessonListResponse = { classArmId: "arm1", lessons: [entry()] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/lessons")) return list;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyLessonsPage />);

    await screen.findByText("Chapter 3: Fractions");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/mark as done/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/upload/i)).not.toBeInTheDocument();
  });

  it("STUDENT: downloads a lesson's attachment via the student-scoped endpoint", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const list: StudentLessonListResponse = {
      classArmId: "arm1",
      lessons: [entry({ attachments: [{ id: "att1", fileName: "notes.pdf", contentType: "application/pdf", sizeBytes: 1024, createdAt: "t" }] })],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path === "/api/v1/me/lessons/les1/attachments/att1/download-url") {
        return { downloadUrl: "https://storage.example/download/att1", expiresAt: "t" };
      }
      if (path.includes("/me/lessons")) return list;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);

    const user = userEvent.setup();
    renderWithProviders(<MyLessonsPage />);

    const downloadButton = await screen.findByRole("button", { name: /notes.pdf/ });
    await user.click(downloadButton);

    await waitFor(() => expect(windowOpen).toHaveBeenCalledWith("https://storage.example/download/att1", "_blank", "noopener,noreferrer"));
  });

  it("STUDENT: shows the empty state with no published lessons", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const list: StudentLessonListResponse = { classArmId: "arm1", lessons: [] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/lessons")) return list;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyLessonsPage />);

    expect(await screen.findByText("No lessons published yet.")).toBeInTheDocument();
  });

  it("PARENT: shows a linked child's lessons read-only — no checkbox, no file input", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const list: StudentLessonListResponse = { classArmId: "arm1", lessons: [entry()] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "PARENT" };
      if (path.includes("/me/children/child-1/lessons")) return list;
      if (path.includes("/me/children")) return { children: [{ studentId: "child-1", firstName: "Kemi", lastName: "Okafor", currentClassArmLabel: "JSS 1 A" }] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyLessonsPage />);

    expect(await screen.findByText("Chapter 3: Fractions")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Child" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("PARENT: downloads a linked child's lesson attachment via the parent-scoped endpoint", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    const list: StudentLessonListResponse = {
      classArmId: "arm1",
      lessons: [entry({ attachments: [{ id: "att1", fileName: "notes.pdf", contentType: "application/pdf", sizeBytes: 1024, createdAt: "t" }] })],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "PARENT" };
      if (path === "/api/v1/me/children/child-1/lessons/les1/attachments/att1/download-url") {
        return { downloadUrl: "https://storage.example/download/att1", expiresAt: "t" };
      }
      if (path.includes("/me/children/child-1/lessons")) return list;
      if (path.includes("/me/children")) return { children: [{ studentId: "child-1", firstName: "Kemi", lastName: "Okafor", currentClassArmLabel: "JSS 1 A" }] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);

    const user = userEvent.setup();
    renderWithProviders(<MyLessonsPage />);

    const downloadButton = await screen.findByRole("button", { name: /notes.pdf/ });
    await user.click(downloadButton);

    await waitFor(() => expect(windowOpen).toHaveBeenCalledWith("https://storage.example/download/att1", "_blank", "noopener,noreferrer"));
  });

  it("PARENT: no children linked shows the empty state without querying lessons", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "PARENT" };
      if (path.includes("/me/children")) return { children: [] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyLessonsPage />);

    expect(await screen.findByText("No children linked to your account yet.")).toBeInTheDocument();
  });
});
