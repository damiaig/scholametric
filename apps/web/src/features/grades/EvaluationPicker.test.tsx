import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EvaluationsListResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { EvaluationPicker } from "./EvaluationPicker";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const OPEN: EvaluationsListResponse = {
  classArmId: "arm1",
  subjectId: "sub1",
  termId: "term1",
  termClosed: false,
  locked: false,
  unlockReason: null,
  evaluations: [{ id: "e1", name: "CA 1", description: "CA 1", createdAt: "t", createdBy: "u1" }],
};

const CLOSED_LOCKED: EvaluationsListResponse = { ...OPEN, termClosed: true, locked: true, unlockReason: null };
const CLOSED_UNLOCKED: EvaluationsListResponse = { ...OPEN, termClosed: true, locked: false, unlockReason: "Parent requested a correction" };

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("EvaluationPicker", () => {
  it("lists evaluations for the given class/subject/term and lets the caller pick one", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/grades/evaluations") return OPEN;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<EvaluationPicker classArmId="arm1" subjectId="sub1" termId="term1" value="" onChange={vi.fn()} allowManage />);

    const select = await screen.findByLabelText("Evaluation");
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(screen.getByRole("option", { name: "CA 1" })).toBeInTheDocument();
  });

  // The exact requirement this proves: the closed-term block must be
  // VISIBLE in the picker itself (disabled "+ New" + a reason banner)
  // BEFORE the teacher ever opens the create form or submits anything —
  // not discovered reactively from a 409 after clicking New.
  it("closed term, no active unlock: disables New and shows the reason banner BEFORE any create attempt", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/grades/evaluations") return CLOSED_LOCKED;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(
      <EvaluationPicker classArmId="arm1" subjectId="sub1" termId="term1" value="" onChange={vi.fn()} allowManage canManageTermLock />,
    );

    expect(await screen.findByText(/This term is closed for this class and subject/)).toBeInTheDocument();
    const newButton = screen.getByRole("button", { name: "New" });
    expect(newButton).toBeDisabled();
  });

  it("closed term WITH an active unlock: New is enabled again and the unlock reason renders", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/grades/evaluations") return CLOSED_UNLOCKED;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(
      <EvaluationPicker classArmId="arm1" subjectId="sub1" termId="term1" value="" onChange={vi.fn()} allowManage canManageTermLock />,
    );

    expect(await screen.findByText(/Unlocked for editing/)).toBeInTheDocument();
    expect(screen.getByText(/Parent requested a correction/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "New" })).not.toBeDisabled());
  });

  it("clicking New opens the create form dialog", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/grades/evaluations") return OPEN;
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<EvaluationPicker classArmId="arm1" subjectId="sub1" termId="term1" value="" onChange={vi.fn()} allowManage />);

    const newButton = await screen.findByRole("button", { name: "New" });
    await waitFor(() => expect(newButton).not.toBeDisabled());
    await user.click(newButton);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New evaluation" })).toBeInTheDocument();
  });

  it("allowManage=false (browse-only, e.g. MarkAbsentDialog) never shows New, Edit, or Delete", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/grades/evaluations") return OPEN;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<EvaluationPicker classArmId="arm1" subjectId="sub1" termId="term1" value="e1" onChange={vi.fn()} />);

    await screen.findByLabelText("Evaluation");
    expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
  });

  it("Delete is hidden without canDelete, even for an allowManage caller (TEACHER/SCHOOL_ADMIN — categorical, PROPRIETOR-only)", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/grades/evaluations") return OPEN;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<EvaluationPicker classArmId="arm1" subjectId="sub1" termId="term1" value="e1" onChange={vi.fn()} allowManage />);

    await screen.findByRole("button", { name: "Edit CA 1" });
    expect(screen.queryByRole("button", { name: "Delete CA 1" })).not.toBeInTheDocument();
  });

  it("deleting the selected evaluation clears the selection on success", async () => {
    mockedApiRequest.mockImplementation(async (path, opts?: { method?: string }) => {
      if (path === "/api/v1/grades/evaluations") return OPEN;
      if (path === "/api/v1/grades/evaluations/e1" && opts?.method === "DELETE") return { id: "e1" };
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EvaluationPicker classArmId="arm1" subjectId="sub1" termId="term1" value="e1" onChange={onChange} allowManage canDelete />,
    );

    await user.click(await screen.findByRole("button", { name: "Delete CA 1" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(""));
  });
});
