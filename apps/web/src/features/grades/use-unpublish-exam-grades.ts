import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UnpublishExamGradesInput, UnpublishExamResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useUnpublishExamGrades() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UnpublishExamGradesInput) => apiRequest<UnpublishExamResponse>("/api/v1/exams/unpublish", { method: "POST", body: input }),
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
