import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, waitFor, cleanup, act, fireEvent, within } from "@testing-library/react";
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
  termClosed: false,
  locked: false,
  unlockReason: null,
  rows: [
    { studentId: "s1", firstName: "Ada", lastName: "Bello", admissionNumber: "SUN/0001", rawScore: null, isAbsent: false, status: "DRAFT" },
    { studentId: "s2", firstName: "Bola", lastName: "Coker", admissionNumber: "SUN/0002", rawScore: null, isAbsent: false, status: "DRAFT" },
    { studentId: "s3", firstName: "Chidi", lastName: "Danjuma", admissionNumber: "SUN/0003", rawScore: null, isAbsent: false, status: "PUBLISHED" },
  ],
};

function savedResponse(scores: { studentId: string; rawScore: number | null; isAbsent?: boolean }[]): SaveGradesGridResponse {
  return {
    classArmId: "arm1",
    subjectId: "sub1",
    componentId: "comp1",
    termId: "term1",
    savedCount: scores.length,
    rows: scores.map((s) => ({
      studentId: s.studentId,
      rawScore: s.rawScore,
      isAbsent: s.isAbsent ?? false,
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
    renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 20, maxWaitMs: 500 }} />);

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
    renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 150, maxWaitMs: 5000 }} />);

    await user.type(await screen.findByLabelText("Score for Ada Bello"), "12");
    await user.type(screen.getByLabelText("Score for Bola Coker"), "18");

    await waitFor(() => expect(putCalls().length).toBe(1));
    const [, options] = putCalls()[0];
    const body = (options as { body: { scores: { studentId: string; rawScore: number | null }[] } }).body;
    expect(body.scores).toEqual(
      expect.arrayContaining([
        { studentId: "s1", rawScore: 12, isAbsent: false },
        { studentId: "s2", rawScore: 18, isAbsent: false },
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
    renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 100000, maxWaitMs: 100 }} />);

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
    renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 20, maxWaitMs: 500 }} />);

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
    renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 20, maxWaitMs: 500 }} />);

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

  it("a flush completing re-arms for an edit stranded during its flight (both the edit's debounce and max-wait timers elapsed mid-flight)", async () => {
    vi.useFakeTimers();
    try {
      let resolveFirst!: (value: SaveGradesGridResponse) => void;
      const seenBatches: { studentId: string; rawScore: number | null }[][] = [];
      mockedApiRequest.mockImplementation(async (path, options) => {
        const method = (options as { method?: string })?.method;
        if (path === "/api/v1/grades/grid" && method !== "PUT") return GRID;
        if (path === "/api/v1/grades/grid" && method === "PUT") {
          const body = options as unknown as { body: { scores: { studentId: string; rawScore: number | null }[] } };
          seenBatches.push(body.body.scores);
          if (seenBatches.length === 1) {
            // s1's flush hangs here — deliberately slow, standing in for a
            // >MAX_WAIT_MS save on a bad connection.
            return new Promise<SaveGradesGridResponse>((resolve) => {
              resolveFirst = resolve;
            });
          }
          return savedResponse(body.body.scores);
        }
        throw new Error("unexpected call");
      });

      renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 100, maxWaitMs: 300 }} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const input1 = screen.getByLabelText("Score for Ada Bello");
      const input2 = screen.getByLabelText("Score for Bola Coker");

      // Edit s1, then advance past its debounce so the (slow) flush starts.
      fireEvent.change(input1, { target: { value: "10" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      expect(seenBatches.length).toBe(1); // s1's flush is now in flight, hung on resolveFirst

      // Edit s2 WHILE s1's flush is still in flight.
      fireEvent.change(input2, { target: { value: "14" } });

      // Advance past BOTH s2's debounce (100ms) and max-wait (300ms) — both
      // fire while flushInFlightRef is still true and early-return with
      // nothing sent. Confirms the bug precondition: no second batch yet.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(seenBatches.length).toBe(1);

      // Now let the slow first flush resolve. Without any further user
      // edit, the fix's post-flight recheck must pick up s2's still-
      // "pending" cell and flush it — no new timer needs to fire, since
      // the recheck flushes immediately.
      await act(async () => {
        resolveFirst(savedResponse([{ studentId: "s1", rawScore: 10 }]));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(seenBatches.length).toBe(2);
      expect(seenBatches[1]).toEqual([{ studentId: "s2", rawScore: 14, isAbsent: false }]);
      expect(screen.getAllByLabelText("Saved")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
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
    renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 150, maxWaitMs: 5000, errorRetryMs: 50 }} />);

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
    renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 150, maxWaitMs: 5000 }} />);

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
    renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 5000, maxWaitMs: 5000 }} />);

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
    renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 5000, maxWaitMs: 5000 }} />);

    const first = await screen.findByLabelText("Score for Ada Bello");
    first.focus();
    await user.tab();
    expect(screen.getByLabelText("Score for Bola Coker")).toHaveFocus();
  });

  describe("absent (SPEC_V0.5.md §2.1)", () => {
    it("pressing A in a focused cell marks it absent — distinct from blank and from 0, and saves isAbsent", async () => {
      mockedApiRequest.mockImplementation(async (path, options) => {
        const method = (options as { method?: string })?.method;
        if (path === "/api/v1/grades/grid" && method !== "PUT") return GRID;
        if (path === "/api/v1/grades/grid" && method === "PUT") {
          const body = options as unknown as { body: { scores: { studentId: string; rawScore: number | null; isAbsent?: boolean }[] } };
          return savedResponse(body.body.scores);
        }
        throw new Error("unexpected call");
      });
      const user = userEvent.setup();
      renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 20, maxWaitMs: 500 }} />);

      const input = await screen.findByLabelText("Score for Ada Bello");
      // userEvent, not a bare input.focus() + fireEvent.keyDown — the raw
      // fireEvent path was observed flaky specifically on the GitHub
      // Actions runner (passed locally every time, intermittently failed
      // in CI with the value never updating at all, not just late) while
      // this file's OTHER absent-toggle test, which already used
      // userEvent throughout, never flaked. userEvent's own dispatch +
      // flush pipeline is more thoroughly exercised than a raw
      // fireEvent+manual-focus combo, so prefer it for this interaction.
      await user.click(input);
      await user.keyboard("a");

      await waitFor(() => expect(input).toHaveValue("Abs"));
      expect(input).toBeDisabled();
      await waitFor(() =>
        expect(putCalls().some(([, options]) => {
          const scores = (options as unknown as { body: { scores: { studentId: string; isAbsent?: boolean }[] } }).body.scores;
          return scores.some((s) => s.studentId === "s1" && s.isAbsent === true);
        })).toBe(true),
      );
    });

    it("clicking the Abs chip toggles absent the same way as the keyboard shortcut, and pressing A again clears it back to blank (not 0)", async () => {
      mockedApiRequest.mockImplementation(async (path, options) => {
        const method = (options as { method?: string })?.method;
        if (path === "/api/v1/grades/grid" && method !== "PUT") return GRID;
        if (path === "/api/v1/grades/grid" && method === "PUT") {
          const body = options as unknown as { body: { scores: { studentId: string; rawScore: number | null; isAbsent?: boolean }[] } };
          return savedResponse(body.body.scores);
        }
        throw new Error("unexpected call");
      });
      const user = userEvent.setup();
      renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 20, maxWaitMs: 500 }} />);

      const input = await screen.findByLabelText("Score for Bola Coker");
      const chip = screen.getByLabelText("Mark Bola Coker absent (or press A)");
      await user.click(chip);
      expect(input).toHaveValue("Abs");
      expect(chip).toHaveAttribute("aria-pressed", "true");
      // Let the toggle-on save settle before toggling off — otherwise this
      // test ends with a pending debounce timer still armed, which fires
      // during a LATER test against a since-reconfigured mock.
      await waitFor(() => expect(putCalls().some(([, o]) => (o as unknown as { body: { scores: { studentId: string }[] } }).body.scores.some((s) => s.studentId === "s2"))).toBe(true));

      await user.click(chip);
      expect(input).not.toHaveValue("Abs");
      expect(input).toHaveValue("");
      expect(chip).toHaveAttribute("aria-pressed", "false");
      expect(input).not.toBeDisabled();
      await waitFor(() => expect(putCalls().length).toBeGreaterThanOrEqual(2));
    });

    it("typing a real score after a prior absent mark clears absent (mutual exclusion)", async () => {
      mockedApiRequest.mockImplementation(async (path, options) => {
        const method = (options as { method?: string })?.method;
        if (path === "/api/v1/grades/grid" && method !== "PUT") return GRID;
        if (path === "/api/v1/grades/grid" && method === "PUT") {
          const body = options as unknown as { body: { scores: { studentId: string; rawScore: number | null; isAbsent?: boolean }[] } };
          return savedResponse(body.body.scores);
        }
        throw new Error("unexpected call");
      });
      const user = userEvent.setup();
      renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 20, maxWaitMs: 500 }} />);

      const input = await screen.findByLabelText("Score for Ada Bello");
      // userEvent throughout — see the sibling test above for why a bare
      // fireEvent.keyDown was dropped here (flaked on the GitHub Actions
      // runner specifically).
      await user.click(input);
      await user.keyboard("a");
      await waitFor(() => expect(input).toHaveValue("Abs"));

      // Toggle absent back off via the chip, not a second "a" keypress on
      // the input — once isAbsent, the input is `disabled`, and a disabled
      // element genuinely cannot receive keyboard input from userEvent (or
      // a real browser); the chip is the only actually-reachable control
      // at that point, same reasoning as "a locked cell ignores the A
      // shortcut" below.
      await user.click(screen.getByLabelText("Mark Ada Bello absent (or press A)"));
      await waitFor(() => expect(input).not.toBeDisabled());
      await user.type(input, "14");
      expect(input).toHaveValue("14");
      expect(input).not.toBeDisabled();
      await waitFor(() => expect(putCalls().length).toBeGreaterThanOrEqual(1));
    });

    it("a locked (PUBLISHED) cell ignores the A shortcut entirely", async () => {
      mockedApiRequest.mockImplementation(async (path, options) => {
        if (path === "/api/v1/grades/grid" && (options as { method?: string })?.method !== "PUT") return GRID;
        throw new Error("unexpected call");
      });
      renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} saveQueueTiming={{ debounceMs: 20, maxWaitMs: 500 }} />);

      const input = await screen.findByLabelText("Score for Chidi Danjuma");
      expect(input).toBeDisabled();
      // A disabled input can't receive keyboard events via userEvent at
      // all — the guard under test is really the chip, which stays
      // disabled and non-interactive for a locked row.
      const chip = screen.getByLabelText("Mark Chidi Danjuma absent (or press A)");
      expect(chip).toBeDisabled();
    });
  });

  describe("term-closed lock (SPEC_V0.5.md §2.3)", () => {
    const CLOSED_LOCKED_GRID: GradesGridResponse = { ...GRID, termClosed: true, locked: true, unlockReason: null };
    const CLOSED_UNLOCKED_GRID: GradesGridResponse = {
      ...GRID,
      termClosed: true,
      locked: false,
      unlockReason: "Parent requested a correction",
    };

    it("renders locked from load (every row disabled) with the ask-to-unlock message — TEACHER sees no Unlock control", async () => {
      mockedApiRequest.mockImplementation(async (path, options) => {
        if (path === "/api/v1/grades/grid" && (options as { method?: string })?.method !== "PUT") return CLOSED_LOCKED_GRID;
        throw new Error("unexpected call");
      });
      renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} />);

      expect(await screen.findByText(/This term is closed for this class and subject/)).toBeInTheDocument();
      expect(screen.getByLabelText("Score for Ada Bello")).toBeDisabled();
      expect(screen.getByLabelText("Score for Bola Coker")).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Unlock" })).not.toBeInTheDocument();
    });

    it("SCHOOL_ADMIN/PROPRIETOR sees the Unlock control on a locked term, requires a reason, and unlocking makes the grid editable again", async () => {
      let unlocked = false;
      mockedApiRequest.mockImplementation(async (path, options) => {
        const method = (options as { method?: string })?.method;
        if (path === "/api/v1/grades/grid" && method !== "PUT") return unlocked ? CLOSED_UNLOCKED_GRID : CLOSED_LOCKED_GRID;
        if (path === "/api/v1/terms/term1/unlock" && method === "POST") {
          unlocked = true;
          return { id: "unlock1", schoolId: "s1", termId: "term1", classArmId: "arm1", subjectId: "sub1", reason: "Parent requested a correction", unlockedBy: "u1", unlockedAt: "t", relockedBy: null, relockedAt: null, createdAt: "t", updatedAt: "t" };
        }
        throw new Error("unexpected call");
      });
      const user = userEvent.setup();
      renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={true} />);

      await screen.findByText(/This term is closed for this class and subject/);
      await user.click(screen.getByRole("button", { name: "Unlock" }));

      const dialog = await screen.findByRole("dialog");
      // Reason required (min 3 chars, matching backend validation) — confirm disabled until then.
      expect(within(dialog).getByRole("button", { name: "Unlock" })).toBeDisabled();
      const reasonInput = within(dialog).getByLabelText("Reason");
      await user.type(reasonInput, "Parent requested a correction");
      expect(reasonInput).toHaveValue("Parent requested a correction");
      await waitFor(() => expect(within(dialog).getByRole("button", { name: "Unlock" })).not.toBeDisabled());
      await user.click(within(dialog).getByRole("button", { name: "Unlock" }));

      await waitFor(() => expect(screen.getByText(/Unlocked for editing/)).toBeInTheDocument());
      expect(screen.getByText(/Parent requested a correction/)).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText("Score for Ada Bello")).not.toBeDisabled());
    });

    it("SCHOOL_ADMIN/PROPRIETOR sees Relock on an unlocked slice; TEACHER sees the reason but no Relock control", async () => {
      mockedApiRequest.mockImplementation(async (path, options) => {
        if (path === "/api/v1/grades/grid" && (options as { method?: string })?.method !== "PUT") return CLOSED_UNLOCKED_GRID;
        throw new Error("unexpected call");
      });
      const { unmount } = renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={false} />);
      expect(await screen.findByText(/Unlocked for editing/)).toBeInTheDocument();
      expect(screen.getByText(/Parent requested a correction/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Relock" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Score for Ada Bello")).not.toBeDisabled();
      unmount();

      renderWithProviders(<ScoreEntryGrid params={PARAMS} canManageTermLock={true} />);
      expect(await screen.findByRole("button", { name: "Relock" })).toBeInTheDocument();
    });
  });
});
