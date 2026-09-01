import { useQuery } from "@tanstack/react-query";
import type { StudentSubjectExamsResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface MyExamsParams {
  subjectId: string;
  termId: string;
  sessionId: string;
}

// v0.7 step 3 (SPEC_V0.7.md §4) — GET /me/exams: no studentId param at
// all (self, resolved server-side from the token) — mirrors
// use-my-report-card.ts's useMyReportCard.
export function useMyExams(params: MyExamsParams | null) {
  return useQuery({
    queryKey: params ? ["me", "exams", params.subjectId, params.termId, params.sessionId] : ["me", "exams", "disabled"],
    queryFn: () =>
      apiRequest<StudentSubjectExamsResponse>("/api/v1/me/exams", {
        query: params ? { subjectId: params.subjectId, termId: params.termId, sessionId: params.sessionId } : undefined,
      }),
    enabled: params !== null,
  });
}
