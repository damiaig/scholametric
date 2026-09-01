import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ExamsListResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { ExamPicker } from "./ExamPicker";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const OPEN: ExamsListResponse = {
  classArmId: "arm1",
  subjectId: "sub1",
  termId: "term1",
  termClosed: false,
  locked: false,
  unlockReason: null,
  exams: [{ id: "e1", name: "Exam", createdAt: "t", createdBy: "u1" }],
};

const CLOSED_LOCKED: ExamsListResponse = { ...OPEN, termClosed: true, locked: true, unlockReason: null };
const CLOSED_UNLOCKED: ExamsListResponse = { ...OPEN, termClosed: true, locked: false, unlockReason: "Parent requested a correction" };

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("ExamPicker", () => {
  // SPEC_V0.7.1.md §3 (item 6) — the same list-not-dropdown treatment as
  // EvaluationPicker (name-only here — exams have no description field).
  it("lists exams for the given class/subject/term, each clickable, and calls onChange on click", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/exams") return OPEN;
      throw new Error(`unexpected call: ${path}`);
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ExamPicker classArmId="arm1" subjectId="sub1" termId="term1" value="" onChange={onChange} allowManage />);

    const examButton = await screen.findByRole("button", { name: "Exam" });
    await user.click(examButton);
    expect(onChange).toHaveBeenCalledWith("e1");
  });

  it("no exams yet: shows the named empty state, not a bare/blank list", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/exams") return { ...OPEN, exams: [] };
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<ExamPicker classArmId="arm1" subjectId="sub1" termId="term1" value="" onChange={vi.fn()} allowManage />);

    expect(await screen.findByText("No exams yet — create one.")).toBeInTheDocument();
  });

  // The exact requirement this proves: the closed-term block must be
  // VISIBLE in the picker itself (disabled "+ New" + a reason banner)
  // BEFORE the teacher ever opens the create form or submits anything.
  it("closed term, no active unlock: disables New and shows the reason banner BEFORE any create attempt", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/exams") return CLOSED_LOCKED;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(
      <ExamPicker classArmId="arm1" subjectId="sub1" termId="term1" value="" onChange={vi.fn()} allowManage canManageTermLock />,
    );

    expect(await screen.findByText(/This term is closed for this class and subject/)).toBeInTheDocument();
    const newButton = screen.getByRole("button", { name: "New" });
    expect(newButton).toBeDisabled();
  });

  it("closed term WITH an active unlock: New is enabled again and the unlock reason renders", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/exams") return CLOSED_UNLOCKED;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(
      <ExamPicker classArmId="arm1" subjectId="sub1" termId="term1" value="" onChange={vi.fn()} allowManage canManageTermLock />,
    );

    expect(await screen.findByText(/Unlocked for editing/)).toBeInTheDocument();
    expect(screen.getByText(/Parent requested a correction/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "New" })).not.toBeDisabled());
  });

  it("clicking New opens the create form dialog", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/exams") return OPEN;
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<ExamPicker classArmId="arm1" subjectId="sub1" termId="term1" value="" onChange={vi.fn()} allowManage />);

    const newButton = await screen.findByRole("button", { name: "New" });
    await waitFor(() => expect(newButton).not.toBeDisabled());
    await user.click(newButton);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New exam" })).toBeInTheDocument();
  });

  it("allowManage=false (browse-only) never shows New, Edit, or Delete", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/exams") return OPEN;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<ExamPicker classArmId="arm1" subjectId="sub1" termId="term1" value="e1" onChange={vi.fn()} />);

    await screen.findByLabelText("Exam");
    expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
  });

  it("Delete is hidden without canDelete, even for an allowManage caller (PROPRIETOR-only)", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/exams") return OPEN;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<ExamPicker classArmId="arm1" subjectId="sub1" termId="term1" value="e1" onChange={vi.fn()} allowManage />);

    await screen.findByRole("button", { name: "Edit Exam" });
    expect(screen.queryByRole("button", { name: "Delete Exam" })).not.toBeInTheDocument();
  });

  it("deleting the selected exam clears the selection on success", async () => {
    mockedApiRequest.mockImplementation(async (path, opts?: { method?: string }) => {
      if (path === "/api/v1/exams") return OPEN;
      if (path === "/api/v1/exams/e1" && opts?.method === "DELETE") return { id: "e1" };
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ExamPicker classArmId="arm1" subjectId="sub1" termId="term1" value="e1" onChange={onChange} allowManage canDelete />,
    );

    await user.click(await screen.findByRole("button", { name: "Delete Exam" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(""));
  });
});
