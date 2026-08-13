import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GradesGridResponse, SaveGradesGridResponse } from "@scholametric/shared";
import { apiRequest, ApiError, getErrorMessage } from "../../lib/api-client";
import { gradesGridQueryKey, type GradesGridParams } from "./use-grades-grid";

export type CellStatus = "idle" | "pending" | "saving" | "saved" | "error" | "locked";

export interface CellState {
  value: number | null;
  serverValue: number | null;
  status: CellStatus;
  error?: string;
}

type Action =
  | { type: "HYDRATE"; rows: { studentId: string; rawScore: number | null; locked: boolean }[] }
  | { type: "EDIT"; studentId: string; value: number | null }
  | { type: "FLUSH_START"; studentIds: string[] }
  | { type: "FLUSH_SUCCESS"; sent: Map<string, number | null>; results: Map<string, number | null> }
  | { type: "FLUSH_ERROR"; sent: Map<string, number | null>; message: string }
  | { type: "REQUEUE"; studentIds: string[] }
  | { type: "LOCK"; studentIds: string[] };

type State = Map<string, CellState>;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE": {
      const next: State = new Map();
      for (const row of action.rows) {
        next.set(row.studentId, {
          value: row.rawScore,
          serverValue: row.rawScore,
          status: row.locked ? "locked" : "idle",
        });
      }
      return next;
    }
    case "EDIT": {
      const current = state.get(action.studentId);
      if (!current || current.status === "locked") return state;
      const next = new Map(state);
      const isDirty = action.value !== current.serverValue;
      next.set(action.studentId, {
        ...current,
        value: action.value,
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
        if (!current || current.value !== sentValue) continue; // clobber guard: re-edited mid-flight, ignore
        const confirmed = action.results.has(id) ? action.results.get(id)! : sentValue;
        next.set(id, { ...current, status: "saved", serverValue: confirmed });
      }
      return next;
    }
    case "FLUSH_ERROR": {
      const next = new Map(state);
      for (const [id, sentValue] of action.sent) {
        const current = next.get(id);
        if (!current || current.value !== sentValue) continue; // already re-edited; next flush sends the new value
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
            error: "Published — ask an admin to unpublish before editing.",
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
  params: GradesGridParams,
  grid: GradesGridResponse | undefined,
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
    const key = gradesGridQueryKey(params).join("|");
    if (hydratedKeyRef.current === key) return; // don't clobber in-progress edits on an unrelated cache update
    hydratedKeyRef.current = key;
    dispatch({
      type: "HYDRATE",
      rows: grid.rows.map((row) => ({ studentId: row.studentId, rawScore: row.rawScore, locked: row.status === "PUBLISHED" })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, params.classArmId, params.subjectId, params.componentId, params.termId]);

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
      const sent = new Map(studentIds.map((id) => [id, stateRef.current.get(id)?.value ?? null]));
      dispatch({ type: "FLUSH_START", studentIds });

      try {
        const response = await apiRequest<SaveGradesGridResponse>("/api/v1/grades/grid", {
          method: "PUT",
          body: {
            classArmId: paramsRef.current.classArmId,
            subjectId: paramsRef.current.subjectId,
            componentId: paramsRef.current.componentId,
            termId: paramsRef.current.termId,
            scores: studentIds.map((id) => ({ studentId: id, rawScore: sent.get(id) ?? null })),
          },
        });
        const results = new Map(response.rows.map((row) => [row.studentId, row.rawScore]));
        dispatch({ type: "FLUSH_SUCCESS", sent, results });
        queryClient.setQueryData<GradesGridResponse>(gradesGridQueryKey(paramsRef.current), (old) => {
          if (!old) return old;
          return {
            ...old,
            rows: old.rows.map((row) =>
              results.has(row.studentId) ? { ...row, rawScore: results.get(row.studentId) ?? null } : row,
            ),
          };
        });
      } catch (error) {
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
      dispatch({ type: "EDIT", studentId, value });
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
    flushNow: attemptFlush,
    isDirty,
  };
}
