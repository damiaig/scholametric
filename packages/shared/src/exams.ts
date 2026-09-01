import { z } from "zod";
import type { ResultStatus } from "./grades";

// Mirrors apps/api/src/exams/exams.service.ts's response interfaces
// (v0.7 steps 1 & 3) — deliberate mirror, not shared runtime code, same
// convention as grades.ts: the backend is the source of truth. Track B —
// exams are a separate track from evaluations (grades.ts) and never
// contribute to a term/subject average there.

export interface ExamScoresRow {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  rawScore: number | null;
  isAbsent: boolean;
  // Subject-level exam status (term_subject_exam_result), not exam-level —
  // same convention as EvaluationScoresRow.status in grades.ts.
  status: ResultStatus;
}

export interface ExamScoresResponse {
  classArmId: string;
  subjectId: string;
  examId: string;
  termId: string;
  termClosed: boolean;
  locked: boolean;
  unlockReason: string | null;
  rows: ExamScoresRow[];
}

export interface SavedExamScoreRow {
  studentId: string;
  rawScore: number | null;
  isAbsent: boolean;
  totalScore: number;
  autoGrade: string | null;
  status: ResultStatus;
}

export interface SaveExamScoresResponse {
  classArmId: string;
  subjectId: string;
  examId: string;
  termId: string;
  savedCount: number;
  rows: SavedExamScoreRow[];
}

export interface ExamScoreItem {
  studentId: string;
  rawScore: number | null;
  isAbsent?: boolean;
}

// v0.7 step 3 — the authoring surface. `name` is always resolved to a
// display string here (defaults to "Exam" server-side) — never null.
export interface Exam {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
}

export interface ExamsListResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  termClosed: boolean;
  locked: boolean;
  unlockReason: string | null;
  exams: Exam[];
}

// `name` optional (unlike evaluationFormSchema's required name+description
// in grades.ts) — an exam needs no teacher-authored name at all.
// A blank input must validate AND submit as omitted (undefined), never as
// "" — the backend DTO's @IsOptional() only skips validation for
// undefined, so a bare "" would 400 there as "shorter than 1 character."
// The transform is what makes leaving this field blank actually reach the
// server as "not provided" rather than an empty string.
export const examFormSchema = z.object({
  name: z
    .string()
    .max(200, "Name must be at most 200 characters")
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
});
export type ExamFormInput = z.infer<typeof examFormSchema>;

export interface CreateExamInput extends ExamFormInput {
  classArmId: string;
  subjectId: string;
  termId: string;
}

export type UpdateExamInput = ExamFormInput;

export interface PublishExamGradesInput {
  classArmId: string;
  subjectId: string;
  termId: string;
}

export type UnpublishExamGradesInput = PublishExamGradesInput;

export interface PublishExamResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  publishedCount: number;
  termExamPublishedCount: number;
  yearExamRecomputedCount: number;
}

export interface UnpublishExamResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  unpublishedCount: number;
  termExamRevertedCount: number;
  yearExamRecomputedCount: number;
}

// v0.7 step 3 (SPEC_V0.7.md §4) — the two exam read views.
export interface StudentExamRow {
  examId: string;
  name: string;
  rawScore: number | null;
  isAbsent: boolean;
}

// The per-term "Show exams" button's data (subject-scoped). For
// STUDENT/PARENT, an unpublished subject reads identically to
// "nothing entered yet" — exams: [], both averages null, status null.
export interface StudentSubjectExamsResponse {
  studentId: string;
  subjectId: string;
  subjectName: string;
  termId: string;
  sessionId: string;
  exams: StudentExamRow[];
  subjectExamAverage: number | null;
  subjectExamGrade: string | null;
  status: ResultStatus | null;
}

export interface YearExamsTermSubject {
  subjectId: string;
  subjectName: string;
  exams: StudentExamRow[];
  subjectExamAverage: number | null;
  subjectExamGrade: string | null;
}

export interface YearExamsTerm {
  termId: string;
  termName: string;
  subjects: YearExamsTermSubject[];
  termExamAverage: number | null;
  termExamGrade: string | null;
  termExamPosition: number | null;
  status: ResultStatus | null;
}

// The dedicated year-long Exams view — one entry per term the student was
// enrolled in this session, each independently gated to PUBLISHED for a
// STUDENT/PARENT caller (a subject can publish before its term's
// cross-subject average does, and a whole term can be absent from the
// year-level picture while another term is fully visible — a
// "partially published year" is a normal, correctly-rendered state, not
// an error).
export interface YearExamsResponse {
  studentId: string;
  sessionId: string;
  terms: YearExamsTerm[];
  overallExamAverage: number | null;
  overallExamGrade: string | null;
  yearExamPosition: number | null;
  termsCount: number;
  overallStatus: ResultStatus | null;
}
