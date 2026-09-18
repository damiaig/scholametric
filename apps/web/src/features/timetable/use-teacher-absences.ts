import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTeacherAbsenceInput, ReplaceTimetableExceptionInput, TeacherAbsenceRow, TimetableExceptionRow } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import type { TimetableRangeParams } from "./use-timetable-views";

// v0.8 step 4 (SPEC_V0.8.md §4) — teacher absence (auto-approved) +
// proprietor replacement. Broad invalidation on both mutations: an absence
// or a replacement can change what students/parents/the teacher/the admin
// each see, so every resolved-schedule query under "me" is invalidated
// rather than trying to enumerate exactly which class/teacher was affected.

export function useCreateTeacherAbsence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeacherAbsenceInput) =>
      apiRequest<TeacherAbsenceRow>("/api/v1/calendar/teacher-absences", { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["calendar", "teacher-absences"] });
    },
  });
}

export function useTeacherAbsences(params: TimetableRangeParams | null) {
  return useQuery({
    queryKey: params ? ["calendar", "teacher-absences", params.from, params.to] : ["calendar", "teacher-absences", "disabled"],
    queryFn: () =>
      apiRequest<TeacherAbsenceRow[]>("/api/v1/calendar/teacher-absences", { query: params ? { from: params.from, to: params.to } : undefined }),
    enabled: params !== null,
  });
}

export function useReplaceTimetableException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReplaceTimetableExceptionInput }) =>
      apiRequest<TimetableExceptionRow>(`/api/v1/calendar/timetable-exceptions/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["calendar", "teacher-absences"] });
    },
  });
}
