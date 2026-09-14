import { useQuery } from "@tanstack/react-query";
import type { ExamReviewResponse, ResultStatus } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — mirrors use-grades-review.ts
// exactly, retargeted to the exam track's pending-approvals surface.
export interface ExamsReviewParams {
  classArmId: string;
  termId: string;
  status?: ResultStatus;
}

export function examsReviewQueryKey(params: ExamsReviewParams) {
  return ["exams", "review", params.classArmId, params.termId, params.status ?? "all"] as const;
}

export function useExamsReview(params: ExamsReviewParams | null) {
  return useQuery({
    queryKey: params ? examsReviewQueryKey(params) : ["exams", "review", "disabled"],
    queryFn: () =>
      apiRequest<ExamReviewResponse>("/api/v1/exams/review", {
        query: params ? { classArmId: params.classArmId, termId: params.termId, status: params.status } : undefined,
      }),
    enabled: params !== null,
  });
}
