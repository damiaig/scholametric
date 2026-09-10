import { z } from "zod";

// Mirrors apps/api/src/grades/grades.service.ts's response interfaces
// (v0.4 steps 2-3, evaluation shapes added v0.7 step 1/2) — deliberate
// mirror, not shared runtime code, same convention as grading-config.ts:
// the backend is the source of truth, this file must be kept in sync by
// hand if those shapes change.

export type ResultStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED";

export interface EvaluationScoresRow {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  rawScore: number | null;
  // SPEC_V0.5.md §2.1 — mutually exclusive with rawScore (never both set).
  // null+false = blank/not-entered; null+true = "Abs".
  isAbsent: boolean;
}

export interface EvaluationScoresResponse {
  classArmId: string;
  subjectId: string;
  evaluationId: string;
  termId: string;
  // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — the evaluation's OWN status, one
  // top-level field, not a per-row one. Publish is per-evaluation and
  // atomic across its whole roster (the completeness gate means every
  // student is decided before publish succeeds), so a PUBLISHED
  // evaluation is read-only for every row on this grid at once — there's
  // no "genuinely mixed" case left to represent per-row.
  evaluationStatus: ResultStatus;
  // SPEC_V0.5.md §2.3, v0.5 step 5, carried into v0.7 — lets the grid
  // render locked/read-only FROM LOAD, not reactively on a save 409.
  // termClosed=false always implies locked=false. unlockReason is
  // populated only when termClosed && !locked (an active unlock exists
  // for this exact class-arm+subject). Orthogonal to evaluationStatus
  // above: this is the TERM-close lock, that is the PUBLISH lock.
  termClosed: boolean;
  locked: boolean;
  unlockReason: string | null;
  rows: EvaluationScoresRow[];
}

export interface SavedEvaluationScoreRow {
  studentId: string;
  rawScore: number | null;
  isAbsent: boolean;
  totalScore: number;
  autoGrade: string | null;
  finalGrade: string | null;
  status: ResultStatus;
}

export interface SaveEvaluationScoresResponse {
  classArmId: string;
  subjectId: string;
  evaluationId: string;
  termId: string;
  savedCount: number;
  rows: SavedEvaluationScoreRow[];
}

export interface EvaluationScoreItem {
  studentId: string;
  rawScore: number | null;
  isAbsent?: boolean;
}

// v0.7 step 2 (SPEC_V0.7.md §3) — the authoring surface. v0.7.4 step 1
// (SPEC_V0.7.4.md §2): the evaluation now carries its OWN status/
// publishedAt — publish is per-evaluation, so this is this row's own
// field (the picker's badge, the score-entry grid's lock, the
// completeness gate all read it directly), not derived from
// term_subject_results at read time.
export interface Evaluation {
  id: string;
  name: string;
  description: string;
  status: ResultStatus;
  publishedAt: string | null;
  createdAt: string;
  createdBy: string;
}

export interface EvaluationsListResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  // Same lock-state contract as EvaluationScoresResponse above — lets the
  // picker render a blocked "+ New evaluation" state (disabled button +
  // reason banner) FROM LOAD, before the teacher ever opens the form.
  termClosed: boolean;
  locked: boolean;
  unlockReason: string | null;
  evaluations: Evaluation[];
}

// Shared by the create/edit form dialog — both fields are required to
// CREATE (mirrors CreateEvaluationDto's length caps exactly), but a PATCH
// only needs to send whatever changed, hence UpdateEvaluationInput below
// makes both optional instead of duplicating the shape.
export const evaluationFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name must be at most 200 characters"),
  description: z.string().min(1, "Description is required").max(2000, "Description must be at most 2000 characters"),
});
export type EvaluationFormInput = z.infer<typeof evaluationFormSchema>;

export interface CreateEvaluationInput extends EvaluationFormInput {
  classArmId: string;
  subjectId: string;
  termId: string;
}

export type UpdateEvaluationInput = Partial<EvaluationFormInput>;

export interface SubjectPositionRow {
  studentId: string;
  totalScore: number;
  finalGrade: string | null;
  subjectPosition: number;
}

// v0.7.4 step 1 — replaces subject-level PublishResponse/PublishGradesInput.
// No request body: the route param carries the evaluation id, which
// already knows its own classArmId/subjectId/termId.
export interface PublishEvaluationResponse {
  evaluationId: string;
  classArmId: string;
  subjectId: string;
  termId: string;
  publishedCount: number;
  subjectPositions: SubjectPositionRow[];
  overallPublishedCount: number;
}

// v0.7.4 step 1 — replaces subject-level UnpublishResponse/UnpublishGradesInput.
export interface UnpublishEvaluationResponse {
  evaluationId: string;
  classArmId: string;
  subjectId: string;
  termId: string;
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
  // SPEC_V0.5.1.md §2.1: true when no subject_teacher_assignment currently
  // exists for this (subject, class arm, session) — the subject already has
  // real results (never hidden once graded) but needs a teacher assigned.
  needsTeacherAssignment: boolean;
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

// v0.7.4 step 1 (SPEC_V0.7.4.md §2) — this is now a pure read-only
// oversight view. Publish/unpublish happens at the evaluation surface
// (EnterScoresTab), not here — there is no action this response's shape
// needs to drive, hence no canPublish.
export interface GradesReviewSubject {
  subjectId: string;
  subjectName: string;
  needsTeacherAssignment: boolean;
  rosterSize: number;
  draftCount: number;
  pendingApprovalCount: number;
  publishedCount: number;
  averageScore: number;
  averageGrade: string | null;
}

export interface GradesReviewResponse {
  classArmId: string;
  termId: string;
  subjects: GradesReviewSubject[];
}

export interface StudentResultSubject {
  subjectId: string;
  subjectName: string;
  needsTeacherAssignment: boolean;
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

// Mirrors GradesService.saveEvaluationScores's bound check: native /100,
// no per-evaluation maxScore (v0.7 step 1) — every caller passes 100.
// Client-side use only: catches the common case before a network round
// trip, the server remains the actual authority.
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

// v0.7 step 4 (SPEC_V0.7.md §4) — the per-evaluation breakdown, replacing
// the old fixed CA1/CA2/Exam ReportCardComponent shape (weight/maxScore/
// requiresApproval all gone — evaluations have none of those, everything's
// native /100 per Q1). Mirrors GradesService.getReportCard() (SPEC_V0.5.md
// §2.4). An evaluation with no evaluation_scores row at all is
// rawScore: null, isAbsent: false — blank/not-entered, distinct from
// isAbsent: true ("Abs" on the printed card).
// v0.7 step 5 (SPEC_V0.7.md §4) — comparative analytics, numbers only
// (no class-average grade letter this step). classAverageScore is the
// class's average on this SAME evaluation; bestScore/worstScore are the
// class's best/worst on it. All three null when nothing decided survives
// the eligibility filter (STUDENT/PARENT: published classmates only;
// staff: the whole class) — never a 0 or a leaked draft score standing in.
export interface ReportCardEvaluation {
  evaluationId: string;
  name: string;
  description: string;
  rawScore: number | null;
  isAbsent: boolean;
  classAverageScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
}

export interface ReportCardSubject {
  subjectId: string;
  subjectName: string;
  needsTeacherAssignment: boolean;
  evaluations: ReportCardEvaluation[];
  totalScore: number;
  autoGrade: string | null;
  overrideGrade: string | null;
  finalGrade: string | null;
  subjectPosition: number | null;
  status: ResultStatus;
  // The class's average totalScore for this subject — same PUBLISHED-only
  // eligibility rule as above.
  classAverageScore: number | null;
}

export interface ReportCardOverall {
  averageScore: number;
  averageGrade: string | null;
  overallPosition: number | null;
  status: ResultStatus;
  subjectsCount: number;
  // The general (across-subjects) class average — same rule, one level up.
  generalClassAverage: number | null;
}

export interface RemarkAuthor {
  firstName: string;
  lastName: string;
}

export interface ReportCardRemarks {
  teacherRemark: string | null;
  teacherRemarkBy: RemarkAuthor | null;
  teacherRemarkAt: string | null;
  principalRemark: string | null;
  principalRemarkBy: RemarkAuthor | null;
  principalRemarkAt: string | null;
}

// A self-contained printable document — student identity and remark-author
// names are embedded directly, unlike StudentResultsResponse above, whose
// caller already has student context.
export interface ReportCardResponse {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  classArmId: string;
  termId: string;
  sessionId: string;
  subjects: ReportCardSubject[];
  overall: ReportCardOverall | null;
  // v0.7.2 step 1 (SPEC_V0.7.2.md §2) — Pronote-style running average: a
  // NEW, ADDITIVE, on-read figure over PUBLISHED subjects so far. Kept as
  // a TOP-LEVEL sibling to `overall`, not nested inside ReportCardOverall,
  // so the type itself signals independence from term_overall_results —
  // this can be non-null while `overall` is still null mid-term, and it
  // never gates or is gated by the official overall/position. null (not
  // 0) when zero subjects are published yet.
  runningAverageScore: number | null;
  // v0.7.3 step 2 (SPEC_V0.7.3.md §3) — the class-wide companion figures
  // to runningAverageScore above: the mean of every published-so-far
  // student's OWN running average (same "≥1 subject published" bar,
  // same top-level independence from `overall`), and this student's
  // provisional rank within that same ≥1-published cohort. Both null
  // when nobody/this student hasn't published anything yet.
  // runningPosition ranks a DIFFERENT, looser cohort than
  // overall.overallPosition (which requires EVERY subject published) —
  // the two can legitimately diverge for the same student; that's the
  // correct consequence of ranking a partial term, not a bug.
  runningClassAverageScore: number | null;
  runningPosition: number | null;
  remarks: ReportCardRemarks;
}

// PUT /students/:id/remarks/teacher and .../principal share this input
// shape (v0.5 step 6) — remark is required-but-nullable: omitting the key
// is a client error, explicit null clears the remark (and its stamps).
export interface WriteRemarkInput {
  termId: string;
  sessionId: string;
  remark: string | null;
}

export interface RemarkResponse {
  id: string;
  studentId: string;
  termId: string;
  sessionId: string;
  classArmId: string;
  teacherRemark: string | null;
  teacherRemarkBy: string | null;
  teacherRemarkAt: string | null;
  principalRemark: string | null;
  principalRemarkBy: string | null;
  principalRemarkAt: string | null;
}
