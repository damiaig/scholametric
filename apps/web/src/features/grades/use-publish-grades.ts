import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PublishGradesInput, PublishResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function usePublishGrades() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PublishGradesInput) => apiRequest<PublishResponse>("/api/v1/grades/publish", { method: "POST", body: input }),
    onSuccess: (_data, variables) => {
      // Publish cascades to positions and (possibly) the whole arm's
      // overall — a plain invalidate is correct here, not a cache patch
      // (no in-progress typing session to protect, unlike the score-entry
      // grid's save queue).
      queryClient.invalidateQueries({ queryKey: ["grades", "review", variables.classArmId, variables.termId] });
      queryClient.invalidateQueries({ queryKey: ["grades", "class-arm-results", variables.classArmId, variables.termId] });
      queryClient.invalidateQueries({ queryKey: ["grades", "student-results"] });
    },
  });
}
