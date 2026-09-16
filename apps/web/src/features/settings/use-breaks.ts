import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Break, BreakInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useBreaks() {
  return useQuery({
    queryKey: ["calendar", "breaks"],
    queryFn: () => apiRequest<Break[]>("/api/v1/calendar/breaks"),
  });
}

export function useCreateBreak() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BreakInput) => apiRequest<Break>("/api/v1/calendar/breaks", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar", "breaks"] }),
  });
}

export function useUpdateBreak() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<BreakInput> }) =>
      apiRequest<Break>(`/api/v1/calendar/breaks/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar", "breaks"] }),
  });
}

export function useDeleteBreak() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ id: string }>(`/api/v1/calendar/breaks/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar", "breaks"] }),
  });
}
