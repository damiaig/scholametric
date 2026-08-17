import { useQuery } from "@tanstack/react-query";
import type { ReportCardResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface ReportCardParams {
  studentId: string;
  termId: string;
  sessionId: string;
}

export function reportCardQueryKey(params: ReportCardParams) {
  return ["grades", "report-card", params.studentId, params.termId, params.sessionId] as const;
}

export function useReportCard(params: ReportCardParams | null) {
  return useQuery({
    queryKey: params ? reportCardQueryKey(params) : ["grades", "report-card", "disabled"],
    queryFn: () =>
      apiRequest<ReportCardResponse>(`/api/v1/students/${params?.studentId}/report-card`, {
        query: params ? { termId: params.termId, sessionId: params.sessionId } : undefined,
      }),
    enabled: params !== null,
  });
}
