import { useQuery } from "@tanstack/react-query";
import type { StudentSubjectExamsResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface ChildExamsParams {
  childId: string;
  subjectId: string;
  termId: string;
  sessionId: string;
}

// v0.7 step 3 (SPEC_V0.7.md §4) — GET /me/children/:childId/exams: reuses
// the exact same published-only path useMyExams exercises for a STUDENT
// — childId is validated server-side against the parent's own linked
// children before any exam query runs. Mirrors use-child-report-card.ts.
export function useChildExams(params: ChildExamsParams | null) {
  return useQuery({
    queryKey: params
      ? ["me", "children", params.childId, "exams", params.subjectId, params.termId, params.sessionId]
      : ["me", "children", "exams", "disabled"],
    queryFn: () =>
      apiRequest<StudentSubjectExamsResponse>(`/api/v1/me/children/${params?.childId}/exams`, {
        query: params ? { subjectId: params.subjectId, termId: params.termId, sessionId: params.sessionId } : undefined,
      }),
    enabled: params !== null,
  });
}
