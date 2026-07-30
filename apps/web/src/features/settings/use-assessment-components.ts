import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssessmentComponent, AssessmentComponentItemInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useAssessmentComponents() {
  return useQuery({
    queryKey: ["assessment-components"],
    queryFn: () => apiRequest<AssessmentComponent[]>("/api/v1/assessment-components"),
  });
}

export function useReplaceAssessmentComponents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: AssessmentComponentItemInput[]) =>
      apiRequest<AssessmentComponent[]>("/api/v1/assessment-components", {
        method: "PUT",
        body: { components: items },
      }),
    onSuccess: (data) => queryClient.setQueryData(["assessment-components"], data),
  });
}
