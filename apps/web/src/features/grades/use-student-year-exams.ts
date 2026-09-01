import { useQuery } from "@tanstack/react-query";
import type { YearExamsResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface StudentYearExamsParams {
  studentId: string;
  sessionId: string;
}

// v0.7 step 3 (SPEC_V0.7.md §4) — the dedicated year-long Exams view,
// staff view: GET /students/:id/year-exams.
export function useStudentYearExams(params: StudentYearExamsParams | null) {
  return useQuery({
    queryKey: params ? ["students", "year-exams", params.studentId, params.sessionId] : ["students", "year-exams", "disabled"],
    queryFn: () =>
      apiRequest<YearExamsResponse>(`/api/v1/students/${params?.studentId}/year-exams`, {
        query: params ? { sessionId: params.sessionId } : undefined,
      }),
    enabled: params !== null,
  });
}
