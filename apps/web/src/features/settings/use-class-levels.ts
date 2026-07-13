import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClassLevel, CreateClassLevelInput, Paginated, UpdateClassLevelInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useClassLevelsList(page: number, pageSize = 20) {
  return useQuery({
    queryKey: ["class-levels", { page, pageSize }],
    queryFn: () => apiRequest<Paginated<ClassLevel>>("/api/v1/class-levels", { query: { page, pageSize } }),
    placeholderData: keepPreviousData,
  });
}

/** Unpaginated, for populating a <select> rather than a DataTable. */
export function useAllClassLevels() {
  return useQuery({
    queryKey: ["class-levels", "all"],
    queryFn: () => apiRequest<Paginated<ClassLevel>>("/api/v1/class-levels", { query: { pageSize: 100 } }),
    select: (data) => data.items,
  });
}

export function useCreateClassLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClassLevelInput) =>
      apiRequest<ClassLevel>("/api/v1/class-levels", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["class-levels"] }),
  });
}

export function useUpdateClassLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClassLevelInput }) =>
      apiRequest<ClassLevel>(`/api/v1/class-levels/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["class-levels"] }),
  });
}
