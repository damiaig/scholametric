import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GradesGridResponse, SaveGradesGridResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest, ApiError } from "../../lib/api-client";
import { ScoreEntryGrid } from "./ScoreEntryGrid";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const PARAMS = { classArmId: "arm1", subjectId: "sub1", componentId: "comp1", termId: "term1" };

const GRID: GradesGridResponse = {
  classArmId: "arm1",
  subjectId: "sub1",
  componentId: "comp1",
  termId: "term1",
  maxScore: 20,
  requiresApproval: false,
  rows: [
    { studentId: "s1", firstName: "Ada", lastName: "Bello", admissionNumber: "SUN/0001", rawScore: null, status: "DRAFT" },
    { studentId: "s2", firstName: "Bola", lastName: "Coker", admissionNumber: "SUN/0002", rawScore: null, status: "DRAFT" },
    { studentId: "s3", firstName: "Chidi", lastName: "Danjuma", admissionNumber: "SUN/0003", rawScore: null, status: "PUBLISHED" },
  ],
};

function savedResponse(scores: { studentId: string; rawScore: number | null }[]): SaveGradesGridResponse {
  return {
    classArmId: "arm1",
    subjectId: "sub1",
    componentId: "comp1",
    termId: "term1",
    savedCount: scores.length,
    rows: scores.map((s) => ({
      studentId: s.studentId,
      rawScore: s.rawScore,
      totalScore: s.rawScore ?? 0,
      autoGrade: null,
      finalGrade: null,
      status: "DRAFT",
    })),
  };
}

function putCalls() {
  return mockedApiRequest.mock.calls.filter(([path, options]) => path === "/api/v1/grades/grid" && (options as { method?: string })?.method === "PUT");
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("ScoreEntryGrid", () => {
  it("renders the roster and marks the already-published row locked from load, not reactively", async () => {
    mockedApiRequest.mockImplementation(async (path, options) => {
      if (path === "/api/v1/grades/grid" && (options as { method?: string })?.method !== "PUT") return GRID;
      throw new Error("unexpected call");
    });
    renderWithProviders(<ScoreEntryGrid params={PARAMS} saveQueueTiming={{ debounceMs: 20, maxWaitMs: 500 }} />);

    expect(await screen.findByLabelText("Score for Ada Bello")).toBeInTheDocument();
    expect(screen.getByLabelText("Score for Chidi Danjuma")).toBeDisabled();
  });

  it("batches edits to two different cells made within the debounce window into one PUT call", async () => {
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/grades/grid" && method !== "PUT") return GRID;
      if (path === "/api/v1/grades/grid" && method === "PUT") {
        const body = options as unknown as { body: { scores: { studentId: string; rawScore: number | null }[] } };
        return savedResponse(body.body.scores);
      }
      throw new Error("unexpected call");
    });
    const user = userEvent.setup();
    renderWithProviders(<ScoreEntryGrid params={PARAMS} saveQueueTiming={{ debounceMs: 150, maxWaitMs: 5000 }} />);

    await user.type(await screen.findByLabelText("Score for Ada Bello"), "12");
    await user.type(screen.getByLabelText("Score for Bola Coker"), "18");

    await waitFor(() => expect(putCalls().length).toBe(1));
    const [, options] = putCalls()[0];
    const body = (options as { body: { scores: { studentId: string; rawScore: number | null }[] } }).body;
    expect(body.scores).toEqual(
      expect.arrayContaining([
        { studentId: "s1", rawScore: 12 },
        { studentId: "s2", rawScore: 18 },
      ]),
    );
    expect(body.scores).toHaveLength(2);
  });

  it("flushes within the max-wait ceiling even without a pause (continuous typing never triggers the debounce)", async () => {
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/grades/grid" && method !== "PUT") return GRID;
      if (path === "/api/v1/grades/grid" && method === "PUT") {
        const body = options as unknown as { body: { scores: { studentId: string; rawScore: number | null }[] } };
        return savedResponse(body.body.scores);
      }
      throw new Error("unexpected call");
    });
    const user = userEvent.setup();
    // debounce longer than the whole test, so only the max-wait ceiling can trigger a flush.
    renderWithProviders(<ScoreEntryGrid params={PARAMS} saveQueueTiming={{ debounceMs: 100000, maxWaitMs: 100 }} />);

    await user.type(await screen.findByLabelText("Score for Ada Bello"), "5");
    await waitFor(() => expect(putCalls().length).toBeGreaterThanOrEqual(1), { timeout: 2000 });
  });

  it("shows saving then saved status glyphs across a flush", async () => {
    let resolvePut!: (value: SaveGradesGridResponse) => void;
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/grades/grid" && method !== "PUT") return GRID;
      if (path === "/api/v1/grades/grid" && method === "PUT") {
        return new Promise<SaveGradesGridResponse>((resolve) => {
          resolvePut = resolve;
        });
      }
      throw new Error("unexpected call");
    });
    const user = userEvent.setup();
    renderWithProviders(<ScoreEntryGrid params={PARAMS} saveQueueTiming={{ debounceMs: 20, maxWaitMs: 500 }} />);

    await user.type(await screen.findByLabelText("Score for Ada Bello"), "9");
    await waitFor(() => expect(screen.getByLabelText("Saving")).toBeInTheDocument());

    resolvePut(savedResponse([{ studentId: "s1", rawScore: 9 }]));
    await waitFor(() => expect(screen.getByLabelText("Saved")).toBeInTheDocument());
  });

  it("clobber guard: a slow response for an old value never overwrites a newer edit made while it was in flight", async () => {
    let resolveSlow!: (value: SaveGradesGridResponse) => void;
    const seenBatches: { studentId: string; rawScore: number | null }[][] = [];
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/grades/grid" && method !== "PUT") return GRID;
      if (path === "/api/v1/grades/grid" && method === "PUT") {
        const body = options as unknown as { body: { scores: { studentId: string; rawScore: number | null }[] } };
        seenBatches.push(body.body.scores);
        if (seenBatches.length === 1) {
          return new Promise<SaveGradesGridResponse>((resolve) => {
            resolveSlow = resolve;
          });
        }
        return savedResponse(body.body.scores);
      }
      throw new Error("unexpected call");
    });
    const user = userEvent.setup();
    renderWithProviders(<ScoreEntryGrid params={PARAMS} saveQueueTiming={{ debounceMs: 20, maxWaitMs: 500 }} />);

    const input = await screen.findByLabelText("Score for Ada Bello");
    await user.type(input, "10");
    await waitFor(() => expect(seenBatches.length).toBe(1)); // first (slow) request sent, holding "10"

    // Edit again while the first request is still in flight.
    await user.clear(input);
    await user.type(input, "15");
    expect(input).toHaveValue("15");

    // Now let the stale first response land, confirming the OLD value (10).
    resolveSlow(savedResponse([{ studentId: "s1", rawScore: 10 }]));

    // The display must stay 15, not revert to the stale confirmed 10.
    await waitFor(() => expect(input).toHaveValue("15"));
    expect(input).not.toHaveValue("10");
  });

  it("400 on a multi-cell batch: splits and retries individually so the valid cells still save", async () => {
    let firstBatchAttempted = false;
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/grades/grid" && method !== "PUT") return GRID;
      if (path === "/api/v1/grades/grid" && method === "PUT") {
        const body = options as unknown as { body: { scores: { studentId: string; rawScore: number | null }[] } };
        const scores = body.body.scores;
        if (scores.length > 1 && !firstBatchAttempted) {
          firstBatchAttempted = true;
          throw new ApiError(400, { statusCode: 400, message: "rawScore for student s2 must be between 0 and 20.", error: "Bad Request", path: "", timestamp: "" });
        }
        // Individual retries: s2 keeps failing, s1 succeeds.
        if (scores.length === 1 && scores[0].studentId === "s2") {
          throw new ApiError(400, { statusCode: 400, message: "rawScore for student s2 must be between 0 and 20.", error: "Bad Request", path: "", timestamp: "" });
        }
        return savedResponse(scores);
      }
      throw new Error("unexpected call");
    });
    const user = userEvent.setup();
    renderWithProviders(<ScoreEntryGrid params={PARAMS} saveQueueTiming={{ debounceMs: 150, maxWaitMs: 5000, errorRetryMs: 50 }} />);

    // s2 gets an out-of-range value the client-side check won't catch here
    // because we're asserting the SERVER-rejection recovery path directly.
    await user.type(await screen.findByLabelText("Score for Ada Bello"), "10");
    await user.type(screen.getByLabelText("Score for Bola Coker"), "10");

    await waitFor(() => expect(screen.getByLabelText("Score for Ada Bello")).toHaveDisplayValue("10"));
    await waitFor(() => expect(screen.getAllByLabelText("Saved").length).toBeGreaterThanOrEqual(1), { timeout: 3000 });
  });

  it("409 with lockedStudentIds: locks exactly those cells and retries the rest of the batch", async () => {
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/grades/grid" && method !== "PUT") return GRID;
      if (path === "/api/v1/grades/grid" && method === "PUT") {
        const body = options as unknown as { body: { scores: { studentId: string; rawScore: number | null }[] } };
        const scores = body.body.scores;
        if (scores.some((s) => s.studentId === "s1")) {
          throw new ApiError(409, {
            statusCode: 409,
            message: "Cannot save scores: this subject's result is already PUBLISHED for 1 student(s) — unpublish first.",
            error: "Conflict",
            path: "",
            timestamp: "",
            lockedStudentIds: ["s1"],
          });
        }
        return savedResponse(scores);
      }
      throw new Error("unexpected call");
    });
    const user = userEvent.setup();
    renderWithProviders(<ScoreEntryGrid params={PARAMS} saveQueueTiming={{ debounceMs: 150, maxWaitMs: 5000 }} />);

    await user.type(await screen.findByLabelText("Score for Ada Bello"), "10");
    await user.type(screen.getByLabelText("Score for Bola Coker"), "14");

    await waitFor(() => expect(screen.getByLabelText("Score for Ada Bello")).toBeDisabled());
    expect(screen.getByText(/Published — ask an admin to unpublish/)).toBeInTheDocument();
    // s2 wasn't the locked one — it should still save successfully, not
    // get stuck failing alongside the genuinely-locked cell.
    expect(screen.getByLabelText("Score for Bola Coker")).not.toBeDisabled();
    await waitFor(() => expect(screen.getAllByLabelText("Saved").length).toBeGreaterThanOrEqual(1));
  });

  it("keyboard: Enter and ArrowDown move focus to the next row's input", async () => {
    mockedApiRequest.mockImplementation(async (path, options) => {
      if (path === "/api/v1/grades/grid" && (options as { method?: string })?.method !== "PUT") return GRID;
      return savedResponse([]);
    });
    const user = userEvent.setup();
    renderWithProviders(<ScoreEntryGrid params={PARAMS} saveQueueTiming={{ debounceMs: 5000, maxWaitMs: 5000 }} />);

    const first = await screen.findByLabelText("Score for Ada Bello");
    const second = screen.getByLabelText("Score for Bola Coker");

    first.focus();
    await user.keyboard("{Enter}");
    expect(second).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(first).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
  });

  it("Tab moves focus in natural DOM order across rows (native browser behavior, no custom handling)", async () => {
    mockedApiRequest.mockImplementation(async (path, options) => {
      if (path === "/api/v1/grades/grid" && (options as { method?: string })?.method !== "PUT") return GRID;
      return savedResponse([]);
    });
    const user = userEvent.setup();
    renderWithProviders(<ScoreEntryGrid params={PARAMS} saveQueueTiming={{ debounceMs: 5000, maxWaitMs: 5000 }} />);

    const first = await screen.findByLabelText("Score for Ada Bello");
    first.focus();
    await user.tab();
    expect(screen.getByLabelText("Score for Bola Coker")).toHaveFocus();
  });
});
