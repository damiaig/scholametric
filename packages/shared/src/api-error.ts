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
}
