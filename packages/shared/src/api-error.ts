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
  // publishEvaluation()'s completeness-gate 409 (SPEC_V0.7.4.md §2,
  // replacing v0.5 step 2's subject-scoped incompleteEntries) — the flat
  // list of students not yet decided for THIS evaluation. A rare race
  // case in practice, since the picker's status badge already signals
  // draft/incomplete before a teacher opens the publish action.
  incompleteStudentIds?: string[];
  // saveGrid's closed-term 409 (SPEC_V0.5.md §2.3, v0.5 step 3/5) — also a
  // race case, since GET /grades/grid already renders locked-from-load.
  termLocked?: boolean;
}
