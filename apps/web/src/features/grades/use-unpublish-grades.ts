import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UnpublishGradesInput, UnpublishResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useUnpublishGrades() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UnpublishGradesInput) => apiRequest<UnpublishResponse>("/api/v1/grades/unpublish", { method: "POST", body: input }),
    onSuccess: (_data, variables) => {
      // Unpublish cascades to the whole arm's overall positions too (Step
      // 3's cascade) — the same broad invalidation as publish.
      queryClient.invalidateQueries({ queryKey: ["grades", "review", variables.classArmId, variables.termId] });
      queryClient.invalidateQueries({ queryKey: ["grades", "class-arm-results", variables.classArmId, variables.termId] });
      queryClient.invalidateQueries({ queryKey: ["grades", "student-results"] });
    },
  });
}
