import { useQuery } from "@tanstack/react-query";
import type { GradesReviewResponse, ResultStatus } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface GradesReviewParams {
  classArmId: string;
  termId: string;
  status?: ResultStatus;
}

export function gradesReviewQueryKey(params: GradesReviewParams) {
  return ["grades", "review", params.classArmId, params.termId, params.status ?? "all"] as const;
}

export function useGradesReview(params: GradesReviewParams | null) {
  return useQuery({
    queryKey: params ? gradesReviewQueryKey(params) : ["grades", "review", "disabled"],
    queryFn: () =>
      apiRequest<GradesReviewResponse>("/api/v1/grades/review", {
        query: params ? { classArmId: params.classArmId, termId: params.termId, status: params.status } : undefined,
      }),
    enabled: params !== null,
  });
}
