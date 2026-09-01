import { useQuery } from "@tanstack/react-query";
import type { YearExamsResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface MyYearExamsParams {
  sessionId: string;
}

// v0.7 step 3 (SPEC_V0.7.md §4) — GET /me/year-exams: self, no studentId param.
export function useMyYearExams(params: MyYearExamsParams | null) {
  return useQuery({
    queryKey: params ? ["me", "year-exams", params.sessionId] : ["me", "year-exams", "disabled"],
    queryFn: () => apiRequest<YearExamsResponse>("/api/v1/me/year-exams", { query: params ? { sessionId: params.sessionId } : undefined }),
    enabled: params !== null,
  });
}
