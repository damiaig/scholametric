import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateEvaluationInput, Evaluation, EvaluationsListResponse, UpdateEvaluationInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface EvaluationsParams {
  classArmId: string;
  subjectId: string;
  termId: string;
}

export function evaluationsQueryKey(params: EvaluationsParams) {
  return ["grades", "evaluations", params.classArmId, params.subjectId, params.termId] as const;
}

// v0.7 step 2 (SPEC_V0.7.md §3) — the evaluation picker's data source.
// Also carries termClosed/locked/unlockReason so the picker can render a
// blocked "+ New evaluation" state (disabled button + reason banner) FROM
// LOAD, before the teacher ever opens the form — same contract
// use-evaluation-scores.ts's grid already relies on.
export function useEvaluations(params: EvaluationsParams | null) {
  return useQuery({
    queryKey: params ? evaluationsQueryKey(params) : ["grades", "evaluations", "disabled"],
    queryFn: () =>
      apiRequest<EvaluationsListResponse>("/api/v1/grades/evaluations", {
        query: params ? { classArmId: params.classArmId, subjectId: params.subjectId, termId: params.termId } : undefined,
      }),
    enabled: params !== null,
  });
}

export function useCreateEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEvaluationInput) => apiRequest<Evaluation>("/api/v1/grades/evaluations", { method: "POST", body: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: evaluationsQueryKey(variables) });
    },
  });
}

export function useUpdateEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEvaluationInput }) =>
      apiRequest<Evaluation>(`/api/v1/grades/evaluations/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      // This mutation only has the evaluation's id, not its (classArmId,
      // subjectId, termId) — broad invalidate instead of a surgical key,
      // same convention as use-correct-published-score.ts.
      queryClient.invalidateQueries({ queryKey: ["grades", "evaluations"] });
    },
  });
}

export function useDeleteEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ id: string }>(`/api/v1/grades/evaluations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      // A delete recomputes this subject's total/grade/position (and
      // possibly overall — docs/DECISIONS.md) — broad invalidate across
      // every view that could now show a stale number, same convention as
      // use-correct-published-score.ts.
      queryClient.invalidateQueries({ queryKey: ["grades", "evaluations"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "evaluation-scores"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "review"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "class-arm-results"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "student-results"] });
    },
  });
}
