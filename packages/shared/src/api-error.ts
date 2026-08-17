import type { IncompleteEntry } from "./grades";

/** Matches the API's global exception filter envelope (apps/api/src/common/filters). */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  // AllExceptionsFilter passes through any extra fields a specific throw
  // site attaches beyond the standard envelope (v0.4 step 2) — grades'
  // 409 published-lock is the only current source, naming exactly which
  // students are locked so a caller doesn't have to guess.
  lockedStudentIds?: string[];
  // publish()'s completeness-gate 409 (SPEC_V0.5.md §2.2, v0.5 step 2) —
  // a rare race case in practice, since canPublish already disables the
  // Publish button in the common case (v0.5 step 5).
  incompleteEntries?: IncompleteEntry[];
  // saveGrid's closed-term 409 (SPEC_V0.5.md §2.3, v0.5 step 3/5) — also a
  // race case, since GET /grades/grid already renders locked-from-load.
  termLocked?: boolean;
}
