import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTimetableSlotInput, TimetableSlot, UpdateTimetableSlotInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useTimetableSlots(classArmId: string | undefined, sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ["calendar", "timetable-slots", classArmId, sessionId],
    queryFn: () => apiRequest<TimetableSlot[]>("/api/v1/calendar/timetable-slots", { query: { classArmId, sessionId: sessionId ?? undefined } }),
    enabled: Boolean(classArmId && sessionId),
  });
}

export function useCreateTimetableSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTimetableSlotInput) =>
      apiRequest<TimetableSlot>("/api/v1/calendar/timetable-slots", { method: "POST", body: input }),
    onSuccess: (data) => queryClient.invalidateQueries({ queryKey: ["calendar", "timetable-slots", data.classArmId, data.sessionId] }),
  });
}

export function useUpdateTimetableSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTimetableSlotInput }) =>
      apiRequest<TimetableSlot>(`/api/v1/calendar/timetable-slots/${id}`, { method: "PATCH", body: input }),
    onSuccess: (data) => queryClient.invalidateQueries({ queryKey: ["calendar", "timetable-slots", data.classArmId, data.sessionId] }),
  });
}

export function useDeleteTimetableSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; classArmId: string; sessionId: string }) =>
      apiRequest<{ id: string }>(`/api/v1/calendar/timetable-slots/${id}`, { method: "DELETE" }),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ["calendar", "timetable-slots", variables.classArmId, variables.sessionId] }),
  });
}
