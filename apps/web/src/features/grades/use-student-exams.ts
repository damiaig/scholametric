import { useQuery } from "@tanstack/react-query";
import type { StudentSubjectExamsResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface StudentSubjectExamsParams {
  studentId: string;
  subjectId: string;
  termId: string;
  sessionId: string;
}

// v0.7 step 3 (SPEC_V0.7.md §4) — the per-term "Show exams" button, staff
// view: GET /students/:id/exams. Mirrors use-report-card.ts's shape.
export function useStudentExams(params: StudentSubjectExamsParams | null) {
  return useQuery({
    queryKey: params
      ? ["students", "exams", params.studentId, params.subjectId, params.termId, params.sessionId]
      : ["students", "exams", "disabled"],
    queryFn: () =>
      apiRequest<StudentSubjectExamsResponse>(`/api/v1/students/${params?.studentId}/exams`, {
        query: params ? { subjectId: params.subjectId, termId: params.termId, sessionId: params.sessionId } : undefined,
      }),
    enabled: params !== null,
  });
}
