import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
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

// StyledDatePicker's own correctness is proven once in
// styled-date-picker.test.tsx — mocked here (the week filter's picker)
// down to a plain native input, same convention LessonFormDialog.test.tsx
// and LessonFilterBar.test.tsx already established.
vi.mock("../../components/ui/styled-date-picker", () => ({
  StyledDatePicker: ({ id, value, onChange, placeholder }: { id?: string; value: string; onChange: (value: string) => void; placeholder?: string }) => (
    <input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  ),
}));

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
    authStore.setTokens({ accessToken: "access-token" });
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

  // v0.8.4 Lessons Read Polish (SPEC_V0.8.4_read_polish.md §1) — the
  // walk-found defect: a long UNBROKEN string (no spaces at all, so there
  // is no whitespace for normal wrapping to break on) must still wrap via
  // break-words rather than overflowing the card. jsdom doesn't lay out
  // real pixels/overflow, so the honest proxy here is the CSS class
  // itself being present plus the full string surviving into the DOM —
  // the ACTUAL visual proof is the re-walk, where a human sees it wrap.
  it("STUDENT: a long body with no spaces gets the wrap class and renders in full, not truncated to an ellipsis", async () => {
    authStore.setTokens({ accessToken: "access-token" });
    const longNoSpaceBody = "a".repeat(300);
    const list: StudentLessonListResponse = { classArmId: "arm1", lessons: [entry({ body: longNoSpaceBody })] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/lessons")) return list;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyLessonsPage />);

    const bodyParagraph = await screen.findByText(longNoSpaceBody);
    expect(bodyParagraph).toHaveClass("break-words");
    expect(bodyParagraph.textContent).toBe(longNoSpaceBody);
  });

  it("STUDENT: the view-more modal's full text also gets the wrap class", async () => {
    authStore.setTokens({ accessToken: "access-token" });
    const longNoSpaceBody = "b".repeat(300);
    const list: StudentLessonListResponse = { classArmId: "arm1", lessons: [entry({ body: longNoSpaceBody })] };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/lessons")) return list;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MyLessonsPage />);

    await user.click(await screen.findByRole("button", { name: "View more" }));
    const modalBody = screen.getAllByText(longNoSpaceBody).find((el) => el.closest('[role="dialog"]'));
    expect(modalBody).toHaveClass("break-words");
  });

  it("STUDENT: subject filter narrows the list to the selected subject", async () => {
    authStore.setTokens({ accessToken: "access-token" });
    const list: StudentLessonListResponse = {
      classArmId: "arm1",
      lessons: [
        entry({ id: "les-math", subjectId: "sub1", subjectName: "Mathematics", title: "Fractions lesson" }),
        entry({ id: "les-eng", subjectId: "sub2", subjectName: "English", title: "Grammar lesson" }),
      ],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/lessons")) return list;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MyLessonsPage />);

    await screen.findByText("Fractions lesson");
    expect(screen.getByText("Grammar lesson")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Subject" }), "sub2");

    expect(screen.queryByText("Fractions lesson")).not.toBeInTheDocument();
    expect(screen.getByText("Grammar lesson")).toBeInTheDocument();
  });

  it("STUDENT: week filter narrows to the picked week; composes with the subject filter; 'Show all' restores both", async () => {
    authStore.setTokens({ accessToken: "access-token" });
    const list: StudentLessonListResponse = {
      classArmId: "arm1",
      lessons: [
        entry({ id: "les-this-week", subjectId: "sub1", subjectName: "Mathematics", title: "This week math", lessonDate: "2026-10-19" }),
        entry({ id: "les-last-week", subjectId: "sub1", subjectName: "Mathematics", title: "Last week math", lessonDate: "2026-10-12" }),
        entry({ id: "les-this-week-eng", subjectId: "sub2", subjectName: "English", title: "This week english", lessonDate: "2026-10-20" }),
      ],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/lessons")) return list;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MyLessonsPage />);

    await screen.findByText("This week math");
    expect(screen.getByText("Last week math")).toBeInTheDocument();
    expect(screen.getByText("This week english")).toBeInTheDocument();

    // Narrow to the week containing 2026-10-19 — drops the prior week's lesson.
    fireEvent.change(screen.getByLabelText("Week"), { target: { value: "2026-10-19" } });
    expect(screen.queryByText("Last week math")).not.toBeInTheDocument();
    expect(screen.getByText("This week math")).toBeInTheDocument();
    expect(screen.getByText("This week english")).toBeInTheDocument();

    // Compose with the subject filter — drops the English lesson too.
    await user.selectOptions(screen.getByRole("combobox", { name: "Subject" }), "sub1");
    expect(screen.queryByText("This week english")).not.toBeInTheDocument();
    expect(screen.getByText("This week math")).toBeInTheDocument();

    // "Show all" restores everything.
    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("This week math")).toBeInTheDocument();
    expect(screen.getByText("Last week math")).toBeInTheDocument();
    expect(screen.getByText("This week english")).toBeInTheDocument();
  });

  it("STUDENT: a filtered-empty result shows a distinct message from the genuine no-lessons-yet state", async () => {
    authStore.setTokens({ accessToken: "access-token" });
    const list: StudentLessonListResponse = {
      classArmId: "arm1",
      lessons: [entry({ subjectId: "sub1", subjectName: "Mathematics", title: "Fractions lesson" })],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/lessons")) return list;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyLessonsPage />);

    await screen.findByText("Fractions lesson");
    fireEvent.change(screen.getByLabelText("Week"), { target: { value: "2026-01-05" } });

    expect(await screen.findByText("No lessons match these filters.")).toBeInTheDocument();
    expect(screen.queryByText("No lessons published yet.")).not.toBeInTheDocument();
  });

  // The structural read-only guarantee must still hold with filters active.
  it("STUDENT: filters introduce no write control — still no checkbox, no file input", async () => {
    authStore.setTokens({ accessToken: "access-token" });
    const list: StudentLessonListResponse = {
      classArmId: "arm1",
      lessons: [
        entry({ id: "les1", subjectId: "sub1", subjectName: "Mathematics", title: "Fractions lesson" }),
        entry({ id: "les2", subjectId: "sub2", subjectName: "English", title: "Grammar lesson" }),
      ],
    };
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "STUDENT" };
      if (path.includes("/me/lessons")) return list;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MyLessonsPage />);

    await screen.findByText("Fractions lesson");
    await user.selectOptions(screen.getByRole("combobox", { name: "Subject" }), "sub1");

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  // The four-level structural read-only guarantee, checked at the DOM
  // level: no mark-done checkbox, no upload control, no "requires
  // upload"/"submissions" text anywhere — because none of that exists
  // for a Lesson at all, not because it's hidden.
  it("STUDENT: no mark-done checkbox and no upload control exist — Lessons are read-only, structurally", async () => {
    authStore.setTokens({ accessToken: "access-token" });
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
    authStore.setTokens({ accessToken: "access-token" });
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
    authStore.setTokens({ accessToken: "access-token" });
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
    authStore.setTokens({ accessToken: "access-token" });
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
    authStore.setTokens({ accessToken: "access-token" });
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
    authStore.setTokens({ accessToken: "access-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return { ...BASE_USER, role: "PARENT" };
      if (path.includes("/me/children")) return { children: [] };
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<MyLessonsPage />);

    expect(await screen.findByText("No children linked to your account yet.")).toBeInTheDocument();
  });
});
