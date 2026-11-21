import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { EvaluationScoresResponse } from "@scholametric/shared";
import { createTestQueryClient } from "../../test/render-with-providers";
import { useScoreEntrySaveQueue } from "./use-score-entry-save-queue";
import { authStore } from "../../lib/auth-store";

interface MockResponse {
  status: number;
  body?: unknown;
}

function mockFetchSequence(responses: MockResponse[]) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      // A real fetch always yields to a real I/O tick before resolving —
      // without this, a purely-microtask-resolving mock can starve this
      // hook's own retry recursion (attemptFlush's "stranded during
      // flight" check) of the macrotask boundary React needs to flush
      // stateRef's effect between attempts, turning a normal retry into
      // a true infinite loop that doesn't even respect Vitest's own
      // testTimeout (found the hard way while writing this test).
      await new Promise((resolve) => setTimeout(resolve, 5));
      const response = responses[Math.min(call++, responses.length - 1)];
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => response.body,
      } as Response;
    }),
  );
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "test-access-token" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  authStore.clear();
});

const PARAMS = { classArmId: "arm-1", subjectId: "subj-1", evaluationId: "eval-1", termId: "term-1" };

const GRID: EvaluationScoresResponse = {
  classArmId: PARAMS.classArmId,
  subjectId: PARAMS.subjectId,
  evaluationId: PARAMS.evaluationId,
  termId: PARAMS.termId,
  evaluationStatus: "DRAFT",
  termClosed: false,
  locked: false,
  unlockReason: null,
  rows: [
    { studentId: "s1", firstName: "A", lastName: "One", admissionNumber: "A1", rawScore: null, isAbsent: false },
    { studentId: "s2", firstName: "B", lastName: "Two", admissionNumber: "A2", rawScore: null, isAbsent: false },
  ],
};

function renderSaveQueue(grid: EvaluationScoresResponse = GRID) {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => useScoreEntrySaveQueue(PARAMS, grid, { debounceMs: 10, maxWaitMs: 10, errorRetryMs: 30 }),
    { wrapper },
  );
}

// v0.9 Step 2b (docs/DECISIONS.md) — advisory-lock contention now comes
// back as a 409/503 with `retryable: true`, checked BEFORE the
// pre-existing termLocked/lockedStudentIds 409 branches below. These
// three tests confirm that ordering doesn't break either pre-existing
// body shape, and that the new one is handled distinctly (auto-retried,
// not shown as a hard lock).
describe("useScoreEntrySaveQueue — 409 body handling", () => {
  it("termLocked: still locks the cell with the term-closed message (pre-existing behavior)", async () => {
    mockFetchSequence([
      {
        status: 409,
        body: { statusCode: 409, message: "closed", error: "Conflict", path: "", timestamp: "t", termLocked: true },
      },
    ]);
    const { result } = renderSaveQueue();

    act(() => result.current.onCellEdit("s1", 85));

    await waitFor(() => expect(result.current.cells.get("s1")?.status).toBe("locked"));
    expect(result.current.cells.get("s1")?.error).toBe(
      "This term was just closed. Ask your principal/proprietor to unlock this class and subject before editing.",
    );
  });

  it("lockedStudentIds: still locks only the named students (pre-existing behavior)", async () => {
    mockFetchSequence([
      {
        status: 409,
        body: {
          statusCode: 409,
          message: "published",
          error: "Conflict",
          path: "",
          timestamp: "t",
          lockedStudentIds: ["s1"],
        },
      },
      // The retry of the remaining (non-locked) student(s) succeeds.
      {
        status: 200,
        body: { classArmId: PARAMS.classArmId, subjectId: PARAMS.subjectId, evaluationId: PARAMS.evaluationId, termId: PARAMS.termId, savedCount: 1, rows: [{ studentId: "s2", rawScore: 70, isAbsent: false, totalScore: 70, autoGrade: "B2", finalGrade: "B2", status: "DRAFT" }] },
      },
    ]);
    const { result } = renderSaveQueue();

    act(() => {
      result.current.onCellEdit("s1", 85);
      result.current.onCellEdit("s2", 70);
    });

    await waitFor(() => expect(result.current.cells.get("s1")?.status).toBe("locked"));
    await waitFor(() => expect(result.current.cells.get("s2")?.status).toBe("saved"));
  });

  it("retryable: does NOT lock the cell — shows the server's message and auto-retries", async () => {
    mockFetchSequence([
      {
        status: 409,
        body: {
          statusCode: 409,
          message: "Another save for this record is already in progress. Please try again in a moment.",
          error: "Conflict",
          path: "",
          timestamp: "t",
          retryable: true,
        },
      },
      {
        status: 200,
        body: { classArmId: PARAMS.classArmId, subjectId: PARAMS.subjectId, evaluationId: PARAMS.evaluationId, termId: PARAMS.termId, savedCount: 1, rows: [{ studentId: "s1", rawScore: 85, isAbsent: false, totalScore: 85, autoGrade: "A1", finalGrade: "A1", status: "DRAFT" }] },
      },
    ]);
    const { result } = renderSaveQueue();

    act(() => result.current.onCellEdit("s1", 85));

    await waitFor(() =>
      expect(result.current.cells.get("s1")?.error).toBe(
        "Another save for this record is already in progress. Please try again in a moment.",
      ),
    );
    expect(result.current.cells.get("s1")?.status).not.toBe("locked");

    // The scheduled retry (errorRetryMs: 20) fires on its own and succeeds
    // against the second mocked response, with no further user action.
    await waitFor(() => expect(result.current.cells.get("s1")?.status).toBe("saved"), { timeout: 2000 });
  });
});
