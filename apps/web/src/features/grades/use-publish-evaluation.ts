import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PublishEvaluationResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.7.4 step 1 (SPEC_V0.7.4.md §2) — replaces use-publish-grades.ts's
// subject-level publish. No request body: the evaluation id already knows
// its own classArmId/subjectId/termId server-side. Same broad-invalidate
// convention as use-correct-published-score.ts/useDeleteEvaluation
// (use-evaluations.ts) — a publish can move subject AND overall positions
// across the whole class arm, plus this evaluation's own status/lock.
export function usePublishEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (evaluationId: string) =>
      apiRequest<PublishEvaluationResponse>(`/api/v1/grades/evaluations/${evaluationId}/publish`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grades", "evaluations"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "evaluation-scores"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "review"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "class-arm-results"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "student-results"] });
    },
  });
}
