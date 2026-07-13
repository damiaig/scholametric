import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTermInput, Paginated, Term } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useTerms(sessionId: string | undefined, page: number, pageSize = 20) {
  return useQuery({
    queryKey: ["terms", sessionId, { page, pageSize }],
    queryFn: () =>
      apiRequest<Paginated<Term>>("/api/v1/terms", { query: { sessionId, page, pageSize } }),
    enabled: Boolean(sessionId),
    placeholderData: keepPreviousData,
  });
}

export function useCreateTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTermInput) => apiRequest<Term>("/api/v1/terms", { method: "POST", body: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["terms", variables.sessionId] });
    },
  });
}

export function useActivateTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<Term>(`/api/v1/terms/${id}/activate`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["terms", data.sessionId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
