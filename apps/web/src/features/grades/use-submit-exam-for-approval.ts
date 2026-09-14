import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SubmitExamForApprovalInput, SubmitExamForApprovalResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — replaces use-publish-exam-grades.ts.
// TEACHER-only action now (own assignment) — this no longer publishes
// directly, it moves a subject's exam results into the admin's approval
// queue. No invalidation of students/me exam-view queries here (unlike
// the old publish hook): PENDING_APPROVAL isn't visible to anyone but
// staff, and the staff exam-scores grid already reflects the new status
// via its own invalidation below.
export function useSubmitExamForApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitExamForApprovalInput) =>
      apiRequest<SubmitExamForApprovalResponse>("/api/v1/exams/submit-for-approval", { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams", "scores"] });
      queryClient.invalidateQueries({ queryKey: ["exams", "review"] });
    },
  });
}
