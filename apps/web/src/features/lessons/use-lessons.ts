import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateLessonInput, Lesson, LessonListResponse, LessonTeachingWeekdaysResponse, UpdateLessonInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.8.4 step 4 (SPEC_V0.8.4.md §6 step 4) — mirrors use-homework.ts
// exactly, minus termId (Lesson has none — classArmId+subjectId alone
// scope every call here, resolved server-side against the current
// session).
export interface LessonListParams {
  classArmId: string;
  subjectId: string;
}

export function lessonListQueryKey(params: LessonListParams) {
  return ["lessons", "list", params.classArmId, params.subjectId] as const;
}

export function useLessonList(params: LessonListParams | null) {
  return useQuery({
    queryKey: params ? lessonListQueryKey(params) : ["lessons", "list", "disabled"],
    queryFn: () =>
      apiRequest<LessonListResponse>("/api/v1/lessons", {
        query: params ? { classArmId: params.classArmId, subjectId: params.subjectId } : undefined,
      }),
    enabled: params !== null,
  });
}

export interface TeachingWeekdaysParams {
  classArmId: string;
  subjectId: string;
}

export function useTeachingWeekdays(params: TeachingWeekdaysParams | null) {
  return useQuery({
    queryKey: params ? ["lessons", "teaching-weekdays", params.classArmId, params.subjectId] : ["lessons", "teaching-weekdays", "disabled"],
    queryFn: () =>
      apiRequest<LessonTeachingWeekdaysResponse>("/api/v1/lessons/teaching-weekdays", {
        query: params ? { classArmId: params.classArmId, subjectId: params.subjectId } : undefined,
      }),
    enabled: params !== null,
  });
}

export function useCreateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLessonInput) => apiRequest<Lesson>("/api/v1/lessons", { method: "POST", body: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: lessonListQueryKey(variables) });
    },
  });
}

export function useUpdateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLessonInput }) =>
      apiRequest<Lesson>(`/api/v1/lessons/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      // Only the lesson's own id is known here, not its (classArmId,
      // subjectId) — broad invalidate, same convention as
      // use-homework.ts's own useUpdateHomework.
      queryClient.invalidateQueries({ queryKey: ["lessons", "list"] });
    },
  });
}

export function usePublishLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<Lesson>(`/api/v1/lessons/${id}/publish`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons", "list"] });
    },
  });
}

export function useUnpublishLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<Lesson>(`/api/v1/lessons/${id}/unpublish`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons", "list"] });
    },
  });
}

export function useDeleteLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ id: string }>(`/api/v1/lessons/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons", "list"] });
    },
  });
}
