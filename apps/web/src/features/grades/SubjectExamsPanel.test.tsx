import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentSubjectExamsResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { SubjectExamsPanel } from "./SubjectExamsPanel";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const PUBLISHED: StudentSubjectExamsResponse = {
  studentId: "st1",
  subjectId: "sub1",
  subjectName: "Mathematics",
  termId: "term1",
  sessionId: "sess1",
  exams: [{ examId: "e1", name: "Exam", rawScore: 78, isAbsent: false, classAverageScore: 65, bestScore: 90, worstScore: 40 }],
  subjectExamAverage: 78,
  subjectExamGrade: "B2",
  status: "PUBLISHED",
  classAverageScore: 70,
};

const EMPTY: StudentSubjectExamsResponse = {
  studentId: "st1",
  subjectId: "sub1",
  subjectName: "Mathematics",
  termId: "term1",
  sessionId: "sess1",
  exams: [],
  subjectExamAverage: null,
  subjectExamGrade: null,
  status: null,
  classAverageScore: null,
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("SubjectExamsPanel", () => {
  it("collapsed by default — never fetches until the button is clicked", () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      throw new Error(`should not be called before expanding: ${path}`);
    });
    renderWithProviders(
      <SubjectExamsPanel subjectId="sub1" subjectName="Mathematics" termId="term1" sessionId="sess1" viewer={{ kind: "self" }} />,
    );
    expect(screen.getByRole("button", { name: "Show exams" })).toBeInTheDocument();
  });

  it("self viewer: expanding fetches GET /me/exams and shows the exam breakdown", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/exams") return PUBLISHED;
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(
      <SubjectExamsPanel subjectId="sub1" subjectName="Mathematics" termId="term1" sessionId="sess1" viewer={{ kind: "self" }} />,
    );

    await user.click(screen.getByRole("button", { name: "Show exams" }));
    expect(await screen.findByText("Exam")).toBeInTheDocument();
    expect(screen.getAllByText("78")).toHaveLength(2); // one exam row + the subject average
    await waitFor(() => expect(screen.getByRole("button", { name: "Hide exams" })).toBeInTheDocument());
  });

  it("v0.7 step 5: renders class average/best/worst as anonymous numbers, per exam and per subject", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/exams") return PUBLISHED;
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(
      <SubjectExamsPanel subjectId="sub1" subjectName="Mathematics" termId="term1" sessionId="sess1" viewer={{ kind: "self" }} />,
    );

    await user.click(screen.getByRole("button", { name: "Show exams" }));
    expect(await screen.findByText("Class avg 65 · Best 90 · Worst 40")).toBeInTheDocument();
    expect(screen.getByText("Class avg 70")).toBeInTheDocument();
  });

  it("self viewer, unpublished subject: shows the empty state, not an error, not a hint of draft data", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/exams") return EMPTY;
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(
      <SubjectExamsPanel subjectId="sub1" subjectName="Mathematics" termId="term1" sessionId="sess1" viewer={{ kind: "self" }} />,
    );

    await user.click(screen.getByRole("button", { name: "Show exams" }));
    expect(await screen.findByText("No exams for Mathematics this term yet.")).toBeInTheDocument();
  });

  it("staff viewer: expanding fetches GET /students/:id/exams", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/students/st1/exams") return PUBLISHED;
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(
      <SubjectExamsPanel
        subjectId="sub1"
        subjectName="Mathematics"
        termId="term1"
        sessionId="sess1"
        viewer={{ kind: "staff", studentId: "st1" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Show exams" }));
    expect(await screen.findByText("Exam")).toBeInTheDocument();
  });

  it("child viewer: expanding fetches GET /me/children/:childId/exams", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/children/child-1/exams") return PUBLISHED;
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(
      <SubjectExamsPanel
        subjectId="sub1"
        subjectName="Mathematics"
        termId="term1"
        sessionId="sess1"
        viewer={{ kind: "child", childId: "child-1" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Show exams" }));
    expect(await screen.findByText("Exam")).toBeInTheDocument();
  });
});
