import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CurrentUserSchool, UpdateSchoolInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useUpdateSchool(schoolId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSchoolInput) =>
      apiRequest<CurrentUserSchool>(`/api/v1/schools/${schoolId}`, { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}
