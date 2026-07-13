import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AcademicSession, CreateSessionInput, Paginated } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useSessions(page: number, pageSize = 20) {
  return useQuery({
    queryKey: ["sessions", { page, pageSize }],
    queryFn: () => apiRequest<Paginated<AcademicSession>>("/api/v1/sessions", { query: { page, pageSize } }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSessionInput) =>
      apiRequest<AcademicSession>("/api/v1/sessions", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useActivateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<AcademicSession>(`/api/v1/sessions/${id}/activate`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["terms"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
