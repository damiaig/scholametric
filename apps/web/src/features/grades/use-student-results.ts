import { useQuery } from "@tanstack/react-query";
import type { StudentResultsResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface StudentResultsParams {
  studentId: string;
  termId: string;
  sessionId: string;
}

export function studentResultsQueryKey(params: StudentResultsParams) {
  return ["grades", "student-results", params.studentId, params.termId, params.sessionId] as const;
}

export function useStudentResults(params: StudentResultsParams | null) {
  return useQuery({
    queryKey: params ? studentResultsQueryKey(params) : ["grades", "student-results", "disabled"],
    queryFn: () =>
      apiRequest<StudentResultsResponse>(`/api/v1/students/${params?.studentId}/results`, {
        query: params ? { termId: params.termId, sessionId: params.sessionId } : undefined,
      }),
    enabled: params !== null,
  });
}
