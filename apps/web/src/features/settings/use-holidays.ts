import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Holiday, HolidayInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// sessionId is fixed at creation — not part of the update payload, same
// convention as evaluations' classArmId/subjectId/termId.
export type UpdateHolidayInput = Partial<Omit<HolidayInput, "sessionId">>;

export function useHolidays(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["calendar", "holidays", sessionId],
    queryFn: () => apiRequest<Holiday[]>("/api/v1/calendar/holidays", { query: { sessionId } }),
    enabled: Boolean(sessionId),
  });
}

export function useCreateHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HolidayInput) => apiRequest<Holiday>("/api/v1/calendar/holidays", { method: "POST", body: input }),
    onSuccess: (data) => queryClient.invalidateQueries({ queryKey: ["calendar", "holidays", data.sessionId] }),
  });
}

export function useUpdateHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHolidayInput }) =>
      apiRequest<Holiday>(`/api/v1/calendar/holidays/${id}`, { method: "PATCH", body: input }),
    onSuccess: (data) => queryClient.invalidateQueries({ queryKey: ["calendar", "holidays", data.sessionId] }),
  });
}

export function useDeleteHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; sessionId: string }) =>
      apiRequest<{ id: string }>(`/api/v1/calendar/holidays/${id}`, { method: "DELETE" }),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ["calendar", "holidays", variables.sessionId] }),
  });
}
