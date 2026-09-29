import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateHomeworkInput, Homework, HomeworkListResponse, UpdateHomeworkInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface HomeworkListParams {
  classArmId: string;
  subjectId: string;
  termId: string;
}

export function homeworkListQueryKey(params: HomeworkListParams) {
  return ["homework", "list", params.classArmId, params.subjectId, params.termId] as const;
}

// v0.8.2 step 5 (SPEC_V0.8.2.md §6 item 5) — same enabled-when-scoped shape
// as use-evaluations.ts's useEvaluations: HomeworkClassPage only renders
// this once classArmId/subjectId/termId are all resolved.
export function useHomeworkList(params: HomeworkListParams | null) {
  return useQuery({
    queryKey: params ? homeworkListQueryKey(params) : ["homework", "list", "disabled"],
    queryFn: () =>
      apiRequest<HomeworkListResponse>("/api/v1/homework", {
        query: params ? { classArmId: params.classArmId, subjectId: params.subjectId, termId: params.termId } : undefined,
      }),
    enabled: params !== null,
  });
}

export function useCreateHomework() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHomeworkInput) => apiRequest<Homework>("/api/v1/homework", { method: "POST", body: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: homeworkListQueryKey(variables) });
    },
  });
}

export function useUpdateHomework() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHomeworkInput }) =>
      apiRequest<Homework>(`/api/v1/homework/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      // Only the homework's own id is known here, not its (classArmId,
      // subjectId, termId) — broad invalidate, same convention as
      // use-evaluations.ts's useUpdateEvaluation.
      queryClient.invalidateQueries({ queryKey: ["homework", "list"] });
    },
  });
}

export function usePublishHomework() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<Homework>(`/api/v1/homework/${id}/publish`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homework", "list"] });
    },
  });
}

export function useUnpublishHomework() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<Homework>(`/api/v1/homework/${id}/unpublish`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homework", "list"] });
    },
  });
}

export function useDeleteHomework() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ id: string }>(`/api/v1/homework/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homework", "list"] });
    },
  });
}
