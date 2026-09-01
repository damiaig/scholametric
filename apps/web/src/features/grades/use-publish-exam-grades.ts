import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PublishExamGradesInput, PublishExamResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.7 step 3 (SPEC_V0.7.md §3) — the minimal publish action on the exam
// scoring page (confirmed: no dedicated Exams Review & Publish page or
// GET /exams/review endpoint this step, unlike the evaluation track's
// ReviewPublishPage). Mirrors use-publish-grades.ts's shape.
export function usePublishExamGrades() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PublishExamGradesInput) => apiRequest<PublishExamResponse>("/api/v1/exams/publish", { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams", "scores"] });
      queryClient.invalidateQueries({ queryKey: ["students", "exams"] });
      queryClient.invalidateQueries({ queryKey: ["students", "year-exams"] });
      queryClient.invalidateQueries({ queryKey: ["me", "exams"] });
      queryClient.invalidateQueries({ queryKey: ["me", "year-exams"] });
      queryClient.invalidateQueries({ queryKey: ["me", "children"] });
    },
  });
}
