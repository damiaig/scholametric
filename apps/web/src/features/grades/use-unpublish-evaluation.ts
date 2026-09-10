import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UnpublishEvaluationResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.7.4 step 1 (SPEC_V0.7.4.md §2) — replaces use-unpublish-grades.ts's
// subject-level unpublish. Unlike the old subject-wide unpublish, this only
// reverts THIS evaluation — the subject may stay derived-PUBLISHED if it
// has other published evaluations, just with a recalculated total. Same
// broad-invalidate as usePublishEvaluation.
export function useUnpublishEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (evaluationId: string) =>
      apiRequest<UnpublishEvaluationResponse>(`/api/v1/grades/evaluations/${evaluationId}/unpublish`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grades", "evaluations"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "evaluation-scores"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "review"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "class-arm-results"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "student-results"] });
    },
  });
}
