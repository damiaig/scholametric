import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EvaluationScoresResponse, SaveEvaluationScoresResponse } from "@scholametric/shared";
import { apiRequest, ApiError, getErrorMessage } from "../../lib/api-client";
import { evaluationScoresQueryKey, type EvaluationScoresParams } from "./use-evaluation-scores";

export type CellStatus = "idle" | "pending" | "saving" | "saved" | "error" | "locked";

export interface CellState {
  value: number | null;
  // SPEC_V0.5.md §2.1 — orthogonal to the save-lifecycle status above, not
  // a seventh status: mirrors the backend's own rawScore/isAbsent mutual
  // exclusion (a cell can be "pending" AND isAbsent). null value + false =
  // blank/not-entered; null value + true = "Abs".
  isAbsent: boolean;
  serverValue: number | null;
  serverIsAbsent: boolean;
  status: CellStatus;
  error?: string;
}

interface SentValue {
  value: number | null;
  isAbsent: boolean;
}

type Action =
  | { type: "HYDRATE"; rows: { studentId: string; rawScore: number | null; isAbsent: boolean; locked: boolean }[] }
  | { type: "EDIT"; studentId: string; value: number | null; isAbsent: boolean }
  | { type: "FLUSH_START"; studentIds: string[] }
  | { type: "FLUSH_SUCCESS"; sent: Map<string, SentValue>; results: Map<string, SentValue> }
  | { type: "FLUSH_ERROR"; sent: Map<string, SentValue>; message: string }
  | { type: "REQUEUE"; studentIds: string[] }
  | { type: "LOCK"; studentIds: string[]; message?: string };

type State = Map<string, CellState>;

const PUBLISHED_LOCK_MESSAGE = "Published — ask an admin to unpublish before editing.";

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE": {
      const next: State = new Map();
      for (const row of action.rows) {
        next.set(row.studentId, {
          value: row.rawScore,
          isAbsent: row.isAbsent,
          serverValue: row.rawScore,
          serverIsAbsent: row.isAbsent,
          status: row.locked ? "locked" : "idle",
        });
      }
      return next;
    }
    case "EDIT": {
      const current = state.get(action.studentId);
      if (!current || current.status === "locked") return state;
      const next = new Map(state);
      const isDirty = action.value !== current.serverValue || action.isAbsent !== current.serverIsAbsent;
      next.set(action.studentId, {
        ...current,
        value: action.value,
        isAbsent: action.isAbsent,
        status: isDirty ? "pending" : "idle",
        error: undefined,
      });
      return next;
    }
    case "FLUSH_START": {
      const next = new Map(state);
      for (const id of action.studentIds) {
        const current = next.get(id);
        if (current) next.set(id, { ...current, status: "saving" });
      }
      return next;
    }
    case "FLUSH_SUCCESS": {
      const next = new Map(state);
      for (const [id, sentValue] of action.sent) {
        const current = next.get(id);
        // clobber guard: re-edited mid-flight, ignore this stale response
        if (!current || current.value !== sentValue.value || current.isAbsent !== sentValue.isAbsent) continue;
        const confirmed = action.results.get(id) ?? sentValue;
        next.set(id, { ...current, status: "saved", serverValue: confirmed.value, serverIsAbsent: confirmed.isAbsent });
      }
      return next;
    }
    case "FLUSH_ERROR": {
      const next = new Map(state);
      for (const [id, sentValue] of action.sent) {
        const current = next.get(id);
        if (!current || current.value !== sentValue.value || current.isAbsent !== sentValue.isAbsent) continue; // already re-edited; next flush sends the new value
        next.set(id, { ...current, status: "error", error: action.message });
      }
      return next;
    }
    case "REQUEUE": {
      const next = new Map(state);
      for (const id of action.studentIds) {
        const current = next.get(id);
        if (current && current.status === "saving") next.set(id, { ...current, status: "pending" });
      }
      return next;
    }
    case "LOCK": {
      const next = new Map(state);
      for (const id of action.studentIds) {
        const current = next.get(id);
        if (current) {
          next.set(id, {
            ...current,
            status: "locked",
            error: action.message ?? PUBLISHED_LOCK_MESSAGE,
          });
        }
      }
      return next;
    }
    default:
      return state;
  }
}

const DEFAULT_DEBOUNCE_MS = 600;
const DEFAULT_MAX_WAIT_MS = 2000;
const DEFAULT_ERROR_RETRY_MS = 3000;
const MAX_BATCH_SIZE = 25;

export interface ScoreEntrySaveQueueTiming {
  debounceMs?: number;
  maxWaitMs?: number;
  errorRetryMs?: number;
}

// Timing is overridable (test-only in practice) so Vitest can exercise
// real debounce/max-wait/retry behavior in milliseconds instead of
// waiting out the production delays — the state machine under test is
// identical either way, only the clock changes.
export function useScoreEntrySaveQueue(
  params: EvaluationScoresParams,
  grid: EvaluationScoresResponse | undefined,
  timing: ScoreEntrySaveQueueTiming = {},
) {
  const DEBOUNCE_MS = timing.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const MAX_WAIT_MS = timing.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const ERROR_RETRY_MS = timing.errorRetryMs ?? DEFAULT_ERROR_RETRY_MS;
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reducer, new Map<string, CellState>());
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const hydratedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!grid) return;
    const key = evaluationScoresQueryKey(params).join("|");
    if (hydratedKeyRef.current === key) return; // don't clobber in-progress edits on an unrelated cache update
    hydratedKeyRef.current = key;
    dispatch({
      type: "HYDRATE",
      // Deliberately NOT folding grid.locked (term-wide) in here —
      // HYDRATE only runs ONCE per params key (see the guard above, by
      // design, to protect in-progress edits from a later cache update),
      // so anything baked in at hydrate time would go stale the moment
      // an unlock/relock changes grid.locked without a full remount.
      // Term-wide lock is instead read LIVE from gridQuery.data on every
      // render (see ScoreEntryGrid) — PUBLISHED-lock is legitimately
      // "sticky" per student (updated reactively only via the save
      // queue's own 409 handling), term-lock is grid-wide and must track
      // the current query data exactly.
      rows: grid.rows.map((row) => ({
        studentId: row.studentId,
        rawScore: row.rawScore,
        isAbsent: row.isAbsent,
        locked: row.status === "PUBLISHED",
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, params.classArmId, params.subjectId, params.evaluationId, params.termId]);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushInFlightRef = useRef(false);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const clearTimers = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (maxWaitTimer.current) clearTimeout(maxWaitTimer.current);
    debounceTimer.current = null;
    maxWaitTimer.current = null;
  }, []);

  const sendBatch = useCallback(
    async (studentIds: string[]): Promise<void> => {
      if (studentIds.length === 0) return;
      const sent = new Map<string, SentValue>(
        studentIds.map((id) => {
          const cell = stateRef.current.get(id);
          return [id, { value: cell?.value ?? null, isAbsent: cell?.isAbsent ?? false }];
        }),
      );
      dispatch({ type: "FLUSH_START", studentIds });

      try {
        const response = await apiRequest<SaveEvaluationScoresResponse>("/api/v1/grades/evaluation-scores", {
          method: "PUT",
          body: {
            classArmId: paramsRef.current.classArmId,
            subjectId: paramsRef.current.subjectId,
            evaluationId: paramsRef.current.evaluationId,
            termId: paramsRef.current.termId,
            scores: studentIds.map((id) => {
              const value = sent.get(id)!;
              return { studentId: id, rawScore: value.value, isAbsent: value.isAbsent };
            }),
          },
        });
        const results = new Map<string, SentValue>(
          response.rows.map((row) => [row.studentId, { value: row.rawScore, isAbsent: row.isAbsent }]),
        );
        dispatch({ type: "FLUSH_SUCCESS", sent, results });
        queryClient.setQueryData<EvaluationScoresResponse>(evaluationScoresQueryKey(paramsRef.current), (old) => {
          if (!old) return old;
          return {
            ...old,
            rows: old.rows.map((row) => {
              const result = results.get(row.studentId);
              return result ? { ...row, rawScore: result.value, isAbsent: result.isAbsent } : row;
            }),
          };
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.body?.termLocked) {
          // Whole-slice lock (SPEC_V0.5.md §2.3) — every requested student
          // in this batch is affected, not just specific ones (unlike the
          // published-lock case below, term_unlocks isn't per-student). In
          // practice this is a race: GET /grades/evaluation-scores already
          // renders locked-from-load, so reaching this means the term closed or
          // was relocked while this save was already in flight.
          dispatch({
            type: "LOCK",
            studentIds,
            message: "This term was just closed. Ask your principal/proprietor to unlock this class and subject before editing.",
          });
          return;
        }

        if (error instanceof ApiError && error.status === 409 && error.body?.lockedStudentIds) {
          const locked = error.body.lockedStudentIds.filter((id) => studentIds.includes(id));
          const remaining = studentIds.filter((id) => !locked.includes(id));
          dispatch({ type: "LOCK", studentIds: locked });
          dispatch({ type: "REQUEUE", studentIds: remaining });
          // The locked ones are known-bad; the rest weren't the problem —
          // retry them as one fresh batch right away rather than waiting
          // for the next debounce cycle.
          if (remaining.length > 0) await sendBatch(remaining);
          return;
        }

        if (error instanceof ApiError && error.status === 400 && studentIds.length > 1) {
          // The batch is atomic and we don't know which single cell is
          // bad — split and retry individually so the valid ones still
          // save and only the genuinely bad one keeps failing.
          dispatch({ type: "REQUEUE", studentIds });
          await Promise.allSettled(studentIds.map((id) => sendBatch([id])));
          return;
        }

        dispatch({ type: "FLUSH_ERROR", sent, message: getErrorMessage(error, "Couldn't save. Retrying…") });
        scheduleRetry(ERROR_RETRY_MS);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient],
  );

  const attemptFlush = useCallback(async () => {
    if (flushInFlightRef.current) return;
    const pending = [...stateRef.current.entries()]
      .filter(([, cell]) => cell.status === "pending" || cell.status === "error")
      .map(([id]) => id);
    if (pending.length === 0) return;

    flushInFlightRef.current = true;
    clearTimers();
    try {
      // Bounded batch size as a defensive cap, not the normal path — under
      // regular typing pace the debounce/max-wait triggers keep batches
      // small on their own.
      for (let i = 0; i < pending.length; i += MAX_BATCH_SIZE) {
        await sendBatch(pending.slice(i, i + MAX_BATCH_SIZE));
      }
    } finally {
      flushInFlightRef.current = false;
      // An edit made WHILE this flush was in flight has its own debounce/
      // max-wait timers — on a slow save (>MAX_WAIT_MS, e.g. a bad 2G
      // connection) both can fire before this flush resolves, find
      // flushInFlightRef still true, and early-return with nothing armed
      // (one-shot timers, not rearmed). Left alone, that cell would sit
      // "pending" until the next keystroke or unmount. Re-check for
      // leftover pending work now and flush again immediately — "error"
      // cells are excluded since sendBatch's catch already arms its own
      // scheduleRetry backoff independently; re-triggering them here too
      // would bypass that backoff and hammer the server on a persistent
      // failure.
      const strandedDuringFlight = [...stateRef.current.entries()].some(([, cell]) => cell.status === "pending");
      if (strandedDuringFlight) void attemptFlush();
    }
  }, [clearTimers, sendBatch]);

  const scheduleRetry = useCallback(
    (delayMs: number) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        void attemptFlush();
      }, delayMs);
    },
    [attemptFlush],
  );

  const scheduleFlush = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void attemptFlush();
    }, DEBOUNCE_MS);
    if (!maxWaitTimer.current) {
      maxWaitTimer.current = setTimeout(() => {
        maxWaitTimer.current = null;
        void attemptFlush();
      }, MAX_WAIT_MS);
    }
  }, [attemptFlush, DEBOUNCE_MS, MAX_WAIT_MS]);

  const onCellEdit = useCallback(
    (studentId: string, value: number | null) => {
      dispatch({ type: "EDIT", studentId, value, isAbsent: false });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  // Keyboard-first absent toggle (SPEC_V0.5.md §2.1) — pressing "A" in a
  // focused cell, or clicking the row's Abs chip. Turning absent ON clears
  // any typed value (mutual exclusion, same as the backend's CHECK);
  // turning it OFF returns to a blank, editable cell, not to 0.
  const onToggleAbsent = useCallback(
    (studentId: string) => {
      const current = stateRef.current.get(studentId);
      if (!current || current.status === "locked") return;
      dispatch({ type: "EDIT", studentId, value: null, isAbsent: !current.isAbsent });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  // Flush whatever's pending on unmount / navigating away from the grid.
  useEffect(() => {
    return () => {
      void attemptFlush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort warning against an accidental tab close/navigation with
  // unsaved edits — can't guarantee the save completes on unload (fetch
  // isn't reliable there), this just stops the accident.
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      const hasPending = [...stateRef.current.values()].some((cell) => cell.status === "pending" || cell.status === "error" || cell.status === "saving");
      if (hasPending) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const isDirty = useMemo(
    () => [...state.values()].some((cell) => cell.status === "pending" || cell.status === "error" || cell.status === "saving"),
    [state],
  );

  return {
    cells: state,
    onCellEdit,
    onToggleAbsent,
    flushNow: attemptFlush,
    isDirty,
  };
}
