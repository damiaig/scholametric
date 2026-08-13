import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ActivationPreview, AcademicSession, CreateSessionInput, Paginated } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// GET /sessions is admin-only server-side (unlike /classes, /subjects) —
// enabled defaults true for every existing call site; v0.4 step 4's grid
// picker passes false for a TEACHER caller, who'd otherwise fire a doomed
// 403 in the background just from this hook being unconditionally called
// (React hooks can't be called conditionally, so the gate has to live here).
export function useSessions(page: number, pageSize = 20, enabled = true) {
  return useQuery({
    queryKey: ["sessions", { page, pageSize }],
    queryFn: () => apiRequest<Paginated<AcademicSession>>("/api/v1/sessions", { query: { page, pageSize } }),
    placeholderData: keepPreviousData,
    enabled,
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

export function useActivationPreview(id: string | null) {
  return useQuery({
    queryKey: ["sessions", id, "activation-preview"],
    queryFn: () => apiRequest<ActivationPreview>(`/api/v1/sessions/${id}/activation-preview`),
    enabled: id !== null,
  });
}

export function useActivateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmName }: { id: string; confirmName: string }) =>
      apiRequest<AcademicSession>(`/api/v1/sessions/${id}/activate`, {
        method: "POST",
        body: { confirmName },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["terms"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
