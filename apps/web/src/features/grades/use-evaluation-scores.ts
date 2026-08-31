import { useQuery } from "@tanstack/react-query";
import type { EvaluationScoresResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface EvaluationScoresParams {
  classArmId: string;
  subjectId: string;
  evaluationId: string;
  termId: string;
}

export function evaluationScoresQueryKey(params: EvaluationScoresParams) {
  return ["grades", "evaluation-scores", params.classArmId, params.subjectId, params.evaluationId, params.termId] as const;
}

// A successful PUT /grades/evaluation-scores patches this query's cache
// directly (see use-score-entry-save-queue.ts) rather than invalidating —
// an invalidate-triggered refetch mid-typing-session would visibly reload
// the grid under the teacher's hands. This hook is the read path only;
// callers needing a real refresh (e.g. to pick up someone else's
// concurrent edit) call `refetch()` explicitly.
export function useEvaluationScores(params: EvaluationScoresParams | null) {
  return useQuery({
    queryKey: params ? evaluationScoresQueryKey(params) : ["grades", "evaluation-scores", "disabled"],
    queryFn: () =>
      apiRequest<EvaluationScoresResponse>("/api/v1/grades/evaluation-scores", {
        query: params
          ? {
              classArmId: params.classArmId,
              subjectId: params.subjectId,
              evaluationId: params.evaluationId,
              termId: params.termId,
            }
          : undefined,
      }),
    enabled: params !== null,
  });
}
