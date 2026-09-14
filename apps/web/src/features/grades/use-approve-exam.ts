import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApproveExamInput, ApproveExamResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — the only path to PUBLISHED now.
// SCHOOL_ADMIN/PROPRIETOR, from the pending-approvals page. Inherits the
// old publish hook's full invalidation set — this is where results
// actually become visible to students/parents.
export function useApproveExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApproveExamInput) => apiRequest<ApproveExamResponse>("/api/v1/exams/approve", { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams", "scores"] });
      queryClient.invalidateQueries({ queryKey: ["exams", "review"] });
      queryClient.invalidateQueries({ queryKey: ["students", "exams"] });
      queryClient.invalidateQueries({ queryKey: ["students", "year-exams"] });
      queryClient.invalidateQueries({ queryKey: ["me", "exams"] });
      queryClient.invalidateQueries({ queryKey: ["me", "year-exams"] });
      queryClient.invalidateQueries({ queryKey: ["me", "children"] });
    },
  });
}
