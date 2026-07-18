import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AddClassArmInput, ClassArm } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useAddClassArm(classLevelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddClassArmInput) =>
      apiRequest<ClassArm>(`/api/v1/class-levels/${classLevelId}/arms`, { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classes"] }),
  });
}
