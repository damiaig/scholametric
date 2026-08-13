// Mirrors apps/api/src/grades/grades.service.ts's response interfaces
// (v0.4 steps 2-3) — deliberate mirror, not shared runtime code, same
// convention as grading-config.ts: the backend is the source of truth,
// this file must be kept in sync by hand if those shapes change.

export type ResultStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED";

export interface GradesGridRow {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  rawScore: number | null;
  // Subject-level status (not component-level) — a PUBLISHED row is
  // read-only regardless of which component this grid is viewing. Can be
  // genuinely mixed within one grid (staggered scoring/publishing).
  status: ResultStatus;
}

export interface GradesGridResponse {
  classArmId: string;
  subjectId: string;
  componentId: string;
  termId: string;
  maxScore: number;
  requiresApproval: boolean;
  rows: GradesGridRow[];
}

export interface SavedGridRow {
  studentId: string;
  rawScore: number | null;
  totalScore: number;
  autoGrade: string | null;
  finalGrade: string | null;
  status: ResultStatus;
}

export interface SaveGradesGridResponse {
  classArmId: string;
  subjectId: string;
  componentId: string;
  termId: string;
  savedCount: number;
  rows: SavedGridRow[];
}

export interface GridScoreItem {
  studentId: string;
  rawScore: number | null;
}

// Mirrors GradesService.saveGrid's bound check: the DTO's own lower bound
// (>= 0) plus the SPECIFIC component's max_score — there is deliberately
// no generic upper cap (see GridScoreItemDto's own comment). Client-side
// use only: catches the common case before a network round trip: the
// server remains the actual authority.
export function validateGridScore(rawScore: number, maxScore: number): { isValid: boolean; error?: string } {
  if (!Number.isFinite(rawScore)) {
    return { isValid: false, error: "Enter a number." };
  }
  if (rawScore < 0) {
    return { isValid: false, error: "Cannot be negative." };
  }
  if (rawScore > maxScore) {
    return { isValid: false, error: `Cannot exceed ${maxScore}.` };
  }
  const decimalPlaces = rawScore.toString().split(".")[1]?.length ?? 0;
  if (decimalPlaces > 2) {
    return { isValid: false, error: "At most 2 decimal places." };
  }
  return { isValid: true };
}
