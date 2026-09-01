import { useQuery } from "@tanstack/react-query";
import type { ExamScoresResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface ExamScoresParams {
  classArmId: string;
  subjectId: string;
  examId: string;
  termId: string;
}

export function examScoresQueryKey(params: ExamScoresParams) {
  return ["exams", "scores", params.classArmId, params.subjectId, params.examId, params.termId] as const;
}

// v0.7 step 3 (SPEC_V0.7.md §3) — Track B's read path, mirroring
// use-evaluation-scores.ts's useEvaluationScores exactly (same cache-
// patch-not-invalidate reasoning, same disabled-key convention). Kept as
// its own hook rather than folded into the evaluation one — the two
// tracks' read paths hit different endpoints and are independently
// cacheable; only the score-entry GRID/save-queue that consumes either is
// what's actually shared (see use-score-entry-save-queue.ts and
// score-entry-track.ts).
export function useExamScores(params: ExamScoresParams | null) {
  return useQuery({
    queryKey: params ? examScoresQueryKey(params) : ["exams", "scores", "disabled"],
    queryFn: () =>
      apiRequest<ExamScoresResponse>("/api/v1/exams/scores", {
        query: params
          ? {
              classArmId: params.classArmId,
              subjectId: params.subjectId,
              examId: params.examId,
              termId: params.termId,
            }
          : undefined,
      }),
    enabled: params !== null,
  });
}
