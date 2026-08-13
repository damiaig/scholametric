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

// Mirrors GradesService.publish()/unpublish()/override() (v0.4 step 3 —
// no web consumer existed until step 5).
export interface PublishGradesInput {
  classArmId: string;
  subjectId: string;
  termId: string;
}

export type UnpublishGradesInput = PublishGradesInput;

export interface SubjectPositionRow {
  studentId: string;
  totalScore: number;
  finalGrade: string | null;
  subjectPosition: number;
}

export interface PublishResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  publishedCount: number;
  subjectPositions: SubjectPositionRow[];
  overallPublishedCount: number;
}

export interface UnpublishResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  unpublishedCount: number;
  overallRevertedCount: number;
}

export interface OverrideGradeInput {
  termSubjectResultId: string;
  overrideGrade: string | null;
}

export interface OverrideResponse {
  id: string;
  studentId: string;
  subjectId: string;
  termId: string;
  overrideGrade: string | null;
  autoGrade: string | null;
  finalGrade: string | null;
  status: ResultStatus;
}

export interface ClassArmResultsStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
}

export interface ClassArmResultsSubjectRow {
  // The term_subject_result id — lets an admin/owner viewer target this
  // exact row for PUT /grades/override without a second lookup.
  id: string;
  studentId: string;
  totalScore: number;
  autoGrade: string | null;
  overrideGrade: string | null;
  finalGrade: string | null;
  subjectPosition: number | null;
  status: ResultStatus;
}

export interface ClassArmResultsSubject {
  subjectId: string;
  subjectName: string;
  averageScore: number;
  averageGrade: string | null;
  results: ClassArmResultsSubjectRow[];
}

export interface ClassArmResultsOverallRow {
  studentId: string;
  averageScore: number;
  averageGrade: string | null;
  overallPosition: number | null;
  status: ResultStatus;
  subjectsCount: number;
}

export interface ClassArmResultsResponse {
  classArmId: string;
  termId: string;
  students: ClassArmResultsStudent[];
  subjects: ClassArmResultsSubject[];
  // null (not []) when the caller is a subject-only TEACHER — see
  // GradesService.getClassArmResults()'s doc comment (apps/api).
  overall: ClassArmResultsOverallRow[] | null;
}

export interface GradesReviewSubject {
  subjectId: string;
  subjectName: string;
  rosterSize: number;
  draftCount: number;
  pendingApprovalCount: number;
  publishedCount: number;
  averageScore: number;
  averageGrade: string | null;
  // Mirrors publish()'s own "nothing to do" 409 condition — disable the
  // Publish button when false instead of offering an action that 409s.
  canPublish: boolean;
}

export interface GradesReviewResponse {
  classArmId: string;
  termId: string;
  subjects: GradesReviewSubject[];
}

export interface StudentResultSubject {
  subjectId: string;
  subjectName: string;
  totalScore: number;
  autoGrade: string | null;
  overrideGrade: string | null;
  finalGrade: string | null;
  classAverageScore: number;
  classAverageGrade: string | null;
  subjectPosition: number | null;
  status: ResultStatus;
}

export interface StudentResultOverall {
  averageScore: number;
  averageGrade: string | null;
  overallPosition: number | null;
  status: ResultStatus;
  subjectsCount: number;
}

export interface StudentResultsResponse {
  studentId: string;
  termId: string;
  sessionId: string;
  subjects: StudentResultSubject[];
  // null when the student has zero term_subject_results this term.
  overall: StudentResultOverall | null;
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
