import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Period, PeriodInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function usePeriods() {
  return useQuery({
    queryKey: ["calendar", "periods"],
    queryFn: () => apiRequest<Period[]>("/api/v1/calendar/periods"),
  });
}

export function useCreatePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PeriodInput) => apiRequest<Period>("/api/v1/calendar/periods", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar", "periods"] }),
  });
}

export function useUpdatePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<PeriodInput> }) =>
      apiRequest<Period>(`/api/v1/calendar/periods/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar", "periods"] }),
  });
}

export function useDeletePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ id: string }>(`/api/v1/calendar/periods/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar", "periods"] }),
  });
}
