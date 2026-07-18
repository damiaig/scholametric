import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateSubjectInput, Paginated, SubjectWithLevels, UpdateSubjectInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

const MAX_SUBJECTS_FOR_PICKER = 100;

/** For assignment dialogs' subject <select> — unpaginated. */
export function useAllSubjects() {
  return useQuery({
    queryKey: ["subjects", "all"],
    queryFn: () =>
      apiRequest<Paginated<SubjectWithLevels>>("/api/v1/subjects", { query: { pageSize: MAX_SUBJECTS_FOR_PICKER } }),
    select: (data) => data.items,
  });
}

export function useSubjectsList(page: number, pageSize = 20) {
  return useQuery({
    queryKey: ["subjects", { page, pageSize }],
    queryFn: () => apiRequest<Paginated<SubjectWithLevels>>("/api/v1/subjects", { query: { page, pageSize } }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubjectInput) =>
      apiRequest<SubjectWithLevels>("/api/v1/subjects", {
        method: "POST",
        body: { name: input.name, code: input.code || undefined },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subjects"] }),
  });
}

export function useUpdateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSubjectInput }) =>
      apiRequest<SubjectWithLevels>(`/api/v1/subjects/${id}`, {
        method: "PATCH",
        body: { name: input.name, code: input.code || undefined },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subjects"] }),
  });
}

export function useDeleteSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ id: string }>(`/api/v1/subjects/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subjects"] }),
  });
}

export function useSetSubjectLevels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, classLevelIds }: { id: string; classLevelIds: string[] }) =>
      apiRequest<SubjectWithLevels>(`/api/v1/subjects/${id}/levels`, { method: "PUT", body: { classLevelIds } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subjects"] }),
  });
}
