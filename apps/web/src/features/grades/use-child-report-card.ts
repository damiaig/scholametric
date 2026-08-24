import { useQuery } from "@tanstack/react-query";
import type { ReportCardResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface ChildReportCardParams {
  childId: string;
  termId: string;
  sessionId: string;
}

// v0.6 step 4 (SPEC_V0.6.md §2.4) — GET /me/children/:childId/report-card:
// reuses the exact same published-only path Step 3's useMyReportCard
// exercises for a STUDENT (grades.service.ts's getReportCard, widened to
// publishedOnlyForSelfView) — childId is validated server-side against
// the parent's own linked children before any grade query runs.
export function useChildReportCard(params: ChildReportCardParams | null) {
  return useQuery({
    queryKey: params ? ["me", "children", params.childId, "report-card", params.termId, params.sessionId] : ["me", "children", "report-card", "disabled"],
    queryFn: () =>
      apiRequest<ReportCardResponse>(`/api/v1/me/children/${params?.childId}/report-card`, {
        query: params ? { termId: params.termId, sessionId: params.sessionId } : undefined,
      }),
    enabled: params !== null,
  });
}
