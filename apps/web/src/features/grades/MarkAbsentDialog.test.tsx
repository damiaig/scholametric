import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Evaluation, EvaluationScoresResponse, EvaluationsListResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest, ApiError } from "../../lib/api-client";
import { MarkAbsentDialog } from "./MarkAbsentDialog";
import type { MarkAbsentTarget } from "./ClassArmResultsView";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const TARGET: MarkAbsentTarget = {
  studentId: "st1",
  studentName: "Chidi Okoro",
  subjectId: "sub1",
  subjectName: "Mathematics",
  classArmId: "arm1",
  termId: "term1",
};

const EVALUATIONS: Evaluation[] = [
  { id: "c1", name: "CA 1", description: "CA 1", createdAt: "t", createdBy: "u1" },
  { id: "exam", name: "Exam", description: "Exam", createdAt: "t", createdBy: "u1" },
];

function evaluationsListResponse(): EvaluationsListResponse {
  return { classArmId: "arm1", subjectId: "sub1", termId: "term1", termClosed: false, locked: false, unlockReason: null, evaluations: EVALUATIONS };
}

function gridResponse(overrides: Partial<EvaluationScoresResponse["rows"][number]>): EvaluationScoresResponse {
  return {
    classArmId: "arm1",
    subjectId: "sub1",
    evaluationId: "exam",
    termId: "term1",
    termClosed: false,
    locked: false,
    unlockReason: null,
    rows: [
      { studentId: "st1", firstName: "Chidi", lastName: "Okoro", admissionNumber: "SUN/0001", rawScore: 100, isAbsent: false, status: "PUBLISHED", ...overrides },
    ],
  };
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

// SPEC_V0.7.1.md §3 (item 6) — EvaluationPicker renders a clickable list,
// not a <select>; find the row by the evaluation's own name and click it.
async function selectEvaluation(user: ReturnType<typeof userEvent.setup>, value: string) {
  const evaluation = EVALUATIONS.find((e) => e.id === value)!;
  const button = await screen.findByRole("button", { name: new RegExp(evaluation.name) });
  await user.click(button);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("MarkAbsentDialog", () => {
  it("renders nothing when target is null", () => {
    mockedApiRequest.mockImplementation(async () => {
      throw new Error("should not be called");
    });
    renderWithProviders(<MarkAbsentDialog target={null} onClose={vi.fn()} />);
    expect(screen.queryByText("Correct a published result")).not.toBeInTheDocument();
  });

  it("picking an evaluation loads and prefills the student's current value", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/grades/evaluations") return evaluationsListResponse();
      if (path === "/api/v1/grades/evaluation-scores") return gridResponse({ rawScore: 100, isAbsent: false });
      throw new Error(`unexpected call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={vi.fn()} />);

    expect(await screen.findByText(/Chidi Okoro — Mathematics/)).toBeInTheDocument();
    await selectEvaluation(user, "exam");

    const scoreInput = (await screen.findByLabelText(/Score \(out of 100\)/)) as HTMLInputElement;
    await waitFor(() => expect(scoreInput.value).toBe("100"));
    expect((screen.getByLabelText("Mark absent") as HTMLInputElement).checked).toBe(false);
  });

  it("prefills as absent (checkbox checked, score field disabled) when the current row is already absent", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/grades/evaluations") return evaluationsListResponse();
      if (path === "/api/v1/grades/evaluation-scores") return gridResponse({ rawScore: null, isAbsent: true });
      throw new Error(`unexpected call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={vi.fn()} />);
    await selectEvaluation(user, "exam");

    const checkbox = (await screen.findByLabelText("Mark absent")) as HTMLInputElement;
    await waitFor(() => expect(checkbox.checked).toBe(true));
    expect(screen.getByLabelText(/Score \(out of 100\)/)).toBeDisabled();
  });

  it("submitting a mark-absent correction calls PUT /grades/evaluation-scores with rawScore: null, isAbsent: true, and closes on success", async () => {
    const onClose = vi.fn();
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/grades/evaluations") return evaluationsListResponse();
      if (path === "/api/v1/grades/evaluation-scores" && (!opts?.method || opts.method === "GET")) return gridResponse({ rawScore: 100, isAbsent: false });
      if (path === "/api/v1/grades/evaluation-scores" && opts?.method === "PUT") {
        expect(opts.body).toEqual({
          classArmId: "arm1",
          subjectId: "sub1",
          evaluationId: "exam",
          termId: "term1",
          scores: [{ studentId: "st1", rawScore: null, isAbsent: true }],
        });
        return gridResponse({ rawScore: null, isAbsent: true });
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={onClose} />);
    await selectEvaluation(user, "exam");
    await screen.findByDisplayValue("100");

    await user.click(screen.getByLabelText("Mark absent"));
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("submitting a score correction (un-absent) sends the real rawScore with isAbsent: false", async () => {
    const onClose = vi.fn();
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/grades/evaluations") return evaluationsListResponse();
      if (path === "/api/v1/grades/evaluation-scores" && (!opts?.method || opts.method === "GET")) return gridResponse({ rawScore: null, isAbsent: true });
      if (path === "/api/v1/grades/evaluation-scores" && opts?.method === "PUT") {
        expect(opts.body).toEqual({
          classArmId: "arm1",
          subjectId: "sub1",
          evaluationId: "exam",
          termId: "term1",
          scores: [{ studentId: "st1", rawScore: 85, isAbsent: false }],
        });
        return gridResponse({ rawScore: 85, isAbsent: false });
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={onClose} />);
    await selectEvaluation(user, "exam");
    await waitFor(() => expect((screen.getByLabelText("Mark absent") as HTMLInputElement).checked).toBe(true));

    await user.click(screen.getByLabelText("Mark absent")); // uncheck
    const scoreInput = screen.getByLabelText(/Score \(out of 100\)/);
    await user.clear(scoreInput);
    await user.type(scoreInput, "85");

    await user.click(screen.getByRole("button", { name: "Save correction" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("a rejected correction (e.g. closed term) shows the backend's message, not a silent failure", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === "/api/v1/grades/evaluations") return evaluationsListResponse();
      if (path === "/api/v1/grades/evaluation-scores" && (!opts?.method || opts.method === "GET")) return gridResponse({ rawScore: 100, isAbsent: false });
      if (path === "/api/v1/grades/evaluation-scores" && opts?.method === "PUT") {
        throw new ApiError(409, {
          statusCode: 409,
          message: "This term is closed. Ask your principal/proprietor to unlock this class and subject before editing.",
          error: "Conflict",
          path: "/api/v1/grades/evaluation-scores",
          timestamp: new Date().toISOString(),
        });
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={vi.fn()} />);
    await selectEvaluation(user, "exam");
    await screen.findByDisplayValue("100");

    await user.click(screen.getByLabelText("Mark absent"));
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    expect(await screen.findByText(/This term is closed/)).toBeInTheDocument();
  });

  it("Save correction is disabled until an evaluation is chosen", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/grades/evaluations") return evaluationsListResponse();
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Save correction" })).toBeDisabled();
  });
});
