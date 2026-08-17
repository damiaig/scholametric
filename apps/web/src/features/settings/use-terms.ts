import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CloseTermResponse, CreateTermInput, Paginated, RelockTermInput, Term, TermUnlock, UnlockTermInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// GET /terms is admin-only server-side — see useSessions' matching comment.
export function useTerms(sessionId: string | undefined, page: number, pageSize = 20, enabled = true) {
  return useQuery({
    queryKey: ["terms", sessionId, { page, pageSize }],
    queryFn: () =>
      apiRequest<Paginated<Term>>("/api/v1/terms", { query: { sessionId, page, pageSize } }),
    enabled: enabled && Boolean(sessionId),
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

// SPEC_V0.5.md §2.3, v0.5 step 5. Warn-but-allow (Q4) — the response
// itself carries what's still unpublished, not a separate preview call.
export function useCloseTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<CloseTermResponse>(`/api/v1/terms/${id}/close`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["terms", data.sessionId] });
      // Broad, not keyed to one params tuple — any currently-open score-
      // entry grid needs to re-fetch and pick up its new locked state,
      // and this mutation doesn't know which grids (if any) are open.
      queryClient.invalidateQueries({ queryKey: ["grades", "grid"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUnlockTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ termId, input }: { termId: string; input: UnlockTermInput }) =>
      apiRequest<TermUnlock>(`/api/v1/terms/${termId}/unlock`, { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grades", "grid"] });
    },
  });
}

export function useRelockTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ termId, input }: { termId: string; input: RelockTermInput }) =>
      apiRequest<TermUnlock>(`/api/v1/terms/${termId}/relock`, { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grades", "grid"] });
    },
  });
}
