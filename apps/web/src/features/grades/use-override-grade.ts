import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OverrideGradeInput, OverrideResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useOverrideGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OverrideGradeInput) => apiRequest<OverrideResponse>("/api/v1/grades/override", { method: "PUT", body: input }),
    onSuccess: () => {
      // The response carries no classArmId (see OverrideResponse) to scope
      // a targeted invalidation — broad-invalidate every results/review
      // query rather than thread extra context through just for this.
      // Cheap: a session only has a handful of these queries cached at once.
      queryClient.invalidateQueries({ queryKey: ["grades", "review"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "class-arm-results"] });
      queryClient.invalidateQueries({ queryKey: ["grades", "student-results"] });
    },
  });
}
