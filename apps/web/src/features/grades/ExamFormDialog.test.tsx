import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Exam } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ExamFormDialog } from "./ExamFormDialog";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const EXISTING: Exam = { id: "e1", name: "Mid-term Exam", createdAt: "t", createdBy: "u1" };

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("ExamFormDialog", () => {
  it("create mode: leaving name blank still submits (server defaults the display name to 'Exam')", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/exams" && opts?.method === "POST") {
        expect(opts.body).toEqual({ name: undefined, classArmId: "arm1", subjectId: "sub1", termId: "term1" });
        return { id: "new1", name: "Exam", createdAt: "t", createdBy: "u1" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ExamFormDialog open onClose={onClose} classArmId="arm1" subjectId="sub1" termId="term1" />);

    expect(screen.getByRole("heading", { name: "New exam" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("create mode: submits a given name merged with the locked classArmId/subjectId/termId", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/exams" && opts?.method === "POST") {
        expect(opts.body).toEqual({ name: "Mid-term Exam", classArmId: "arm1", subjectId: "sub1", termId: "term1" });
        return { id: "new1", name: "Mid-term Exam", createdAt: "t", createdBy: "u1" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ExamFormDialog open onClose={onClose} classArmId="arm1" subjectId="sub1" termId="term1" />);

    await user.type(screen.getByLabelText("Name (optional)"), "Mid-term Exam");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("400s a name over the 200-character cap client-side (zod), without calling the API", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      throw new Error(`should not be called: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<ExamFormDialog open onClose={vi.fn()} classArmId="arm1" subjectId="sub1" termId="term1" />);

    await user.type(screen.getByLabelText("Name (optional)"), "x".repeat(201));
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Name must be at most 200 characters")).toBeInTheDocument();
  });

  it("edit mode: prefills from the given exam and PATCHes only name", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/exams/e1" && opts?.method === "PATCH") {
        expect(opts.body).toEqual({ name: "Revised Exam" });
        return { ...EXISTING, name: "Revised Exam" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ExamFormDialog open onClose={onClose} classArmId="arm1" subjectId="sub1" termId="term1" exam={EXISTING} />);

    expect(screen.getByRole("heading", { name: "Edit exam" })).toBeInTheDocument();
    const nameInput = screen.getByLabelText("Name (optional)") as HTMLInputElement;
    await waitFor(() => expect(nameInput).toHaveValue("Mid-term Exam"));

    await user.clear(nameInput);
    await user.type(nameInput, "Revised Exam");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
