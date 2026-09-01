import { useQuery } from "@tanstack/react-query";
import type { YearExamsResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface ChildYearExamsParams {
  childId: string;
  sessionId: string;
}

// v0.7 step 3 (SPEC_V0.7.md §4) — GET /me/children/:childId/year-exams.
export function useChildYearExams(params: ChildYearExamsParams | null) {
  return useQuery({
    queryKey: params ? ["me", "children", params.childId, "year-exams", params.sessionId] : ["me", "children", "year-exams", "disabled"],
    queryFn: () =>
      apiRequest<YearExamsResponse>(`/api/v1/me/children/${params?.childId}/year-exams`, {
        query: params ? { sessionId: params.sessionId } : undefined,
      }),
    enabled: params !== null,
  });
}
