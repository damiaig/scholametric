import type { EvaluationScoresParams } from "./use-evaluation-scores";
import { evaluationScoresQueryKey } from "./use-evaluation-scores";
import type { ExamScoresParams } from "./use-exam-scores";
import { examScoresQueryKey } from "./use-exam-scores";

// v0.7 step 3 — the score-entry grid and its save queue are shared
// between both tracks (SPEC_V0.7.md §3: "reuse the grid, don't
// duplicate it"). Discriminated by SHAPE (which id field is present),
// not a separate `track` prop — this is what lets ScoreEntryGrid's
// existing `params` prop stay exactly the shape it already was for
// evaluations (EvaluationScoresParams), so nothing about the v0.7 step 2
// evaluation call site or its tests needs to change: an evaluation caller
// passes the same object it always did, and it's still assignable to
// this union without any new required field.
export type EntryParams = EvaluationScoresParams | ExamScoresParams;

export function isExamParams(params: EntryParams): params is ExamScoresParams {
  return "examId" in params;
}

export function entryId(params: EntryParams): string {
  return isExamParams(params) ? params.examId : params.evaluationId;
}

export function idFieldName(params: EntryParams): "evaluationId" | "examId" {
  return isExamParams(params) ? "examId" : "evaluationId";
}

export function scoresEndpoint(params: EntryParams): string {
  return isExamParams(params) ? "/api/v1/exams/scores" : "/api/v1/grades/evaluation-scores";
}

export function scoresQueryKey(params: EntryParams) {
  return isExamParams(params) ? examScoresQueryKey(params) : evaluationScoresQueryKey(params);
}
