import { useQuery } from "@tanstack/react-query";
import type { ReportCardResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface MyReportCardParams {
  termId: string;
  sessionId: string;
}

// v0.6 step 3 (SPEC_V0.6.md §2.3) — GET /me/report-card: no studentId
// param at all (self, resolved server-side from the token) — unlike
// use-report-card.ts's useReportCard, which takes a studentId because a
// staff caller is looking up someone else's.
export function useMyReportCard(params: MyReportCardParams | null) {
  return useQuery({
    queryKey: params ? ["me", "report-card", params.termId, params.sessionId] : ["me", "report-card", "disabled"],
    queryFn: () =>
      apiRequest<ReportCardResponse>("/api/v1/me/report-card", {
        query: params ? { termId: params.termId, sessionId: params.sessionId } : undefined,
      }),
    enabled: params !== null,
  });
}
