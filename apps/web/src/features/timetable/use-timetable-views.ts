import { useQuery } from "@tanstack/react-query";
import type { ClassTimetableResponse, TeacherTimetableResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface TimetableRangeParams {
  from: string;
  to: string;
}

// v0.8 step 3 (SPEC_V0.8.md §7 item 3) — no classArmId param at all (self,
// resolved server-side from the token), same "no id to request another
// class with" shape as useMyReportCard.
export function useMyTimetable(params: TimetableRangeParams | null) {
  return useQuery({
    queryKey: params ? ["me", "timetable", params.from, params.to] : ["me", "timetable", "disabled"],
    queryFn: () => apiRequest<ClassTimetableResponse>("/api/v1/me/timetable", { query: params ? { from: params.from, to: params.to } : undefined }),
    enabled: params !== null,
  });
}

export interface ChildTimetableParams extends TimetableRangeParams {
  childId: string;
}

// childId is validated server-side against the parent's own linked
// children before any resolution runs — same reuse as useChildReportCard.
export function useChildTimetable(params: ChildTimetableParams | null) {
  return useQuery({
    queryKey: params ? ["me", "children", params.childId, "timetable", params.from, params.to] : ["me", "children", "timetable", "disabled"],
    queryFn: () =>
      apiRequest<ClassTimetableResponse>(`/api/v1/me/children/${params?.childId}/timetable`, {
        query: params ? { from: params.from, to: params.to } : undefined,
      }),
    enabled: params !== null,
  });
}

// TEACHER's own slots across every class they teach — teacherUserId is
// always the JWT subject, never a request field.
export function useTeachingTimetable(params: TimetableRangeParams | null) {
  return useQuery({
    queryKey: params ? ["me", "teaching-timetable", params.from, params.to] : ["me", "teaching-timetable", "disabled"],
    queryFn: () =>
      apiRequest<TeacherTimetableResponse>("/api/v1/me/teaching-timetable", { query: params ? { from: params.from, to: params.to } : undefined }),
    enabled: params !== null,
  });
}
