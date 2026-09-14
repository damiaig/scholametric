import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RejectExamInput, RejectExamResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — PENDING_APPROVAL -> DRAFT, from the
// pending-approvals page. No student/parent-facing invalidation needed:
// a rejected subject was never visible to them (PENDING_APPROVAL fails
// the published-only filter the same as DRAFT).
export function useRejectExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RejectExamInput) => apiRequest<RejectExamResponse>("/api/v1/exams/reject", { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams", "scores"] });
      queryClient.invalidateQueries({ queryKey: ["exams", "review"] });
    },
  });
}
