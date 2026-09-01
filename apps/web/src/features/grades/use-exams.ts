import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateExamInput, Exam, ExamsListResponse, UpdateExamInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface ExamsParams {
  classArmId: string;
  subjectId: string;
  termId: string;
}

export function examsQueryKey(params: ExamsParams) {
  return ["exams", "list", params.classArmId, params.subjectId, params.termId] as const;
}

// v0.7 step 3 (SPEC_V0.7.md §3) — mirrors use-evaluations.ts exactly,
// retargeted to /api/v1/exams. Also carries termClosed/locked/unlockReason
// so the picker can render a blocked "+ New exam" state FROM LOAD.
export function useExams(params: ExamsParams | null) {
  return useQuery({
    queryKey: params ? examsQueryKey(params) : ["exams", "list", "disabled"],
    queryFn: () =>
      apiRequest<ExamsListResponse>("/api/v1/exams", {
        query: params ? { classArmId: params.classArmId, subjectId: params.subjectId, termId: params.termId } : undefined,
      }),
    enabled: params !== null,
  });
}

export function useCreateExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExamInput) => apiRequest<Exam>("/api/v1/exams", { method: "POST", body: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: examsQueryKey(variables) });
    },
  });
}

export function useUpdateExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateExamInput }) =>
      apiRequest<Exam>(`/api/v1/exams/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams", "list"] });
    },
  });
}

export function useDeleteExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ id: string }>(`/api/v1/exams/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      // A delete recomputes this subject's total/grade (and possibly the
      // term/year cross-subject aggregates — docs/DECISIONS.md) — broad
      // invalidate across every exam-related query, same convention as
      // use-evaluations.ts's useDeleteEvaluation.
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      queryClient.invalidateQueries({ queryKey: ["students", "exams"] });
      queryClient.invalidateQueries({ queryKey: ["students", "year-exams"] });
      queryClient.invalidateQueries({ queryKey: ["me", "exams"] });
      queryClient.invalidateQueries({ queryKey: ["me", "year-exams"] });
      queryClient.invalidateQueries({ queryKey: ["me", "children"] });
    },
  });
}
