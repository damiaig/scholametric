import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api-client";

export function useSetClassTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classArmId, teacherUserId }: { classArmId: string; teacherUserId: string }) =>
      apiRequest<{ id: string }>(`/api/v1/class-arms/${classArmId}/class-teacher`, {
        method: "PUT",
        body: { teacherUserId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
  });
}

export function useRemoveClassTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (classArmId: string) =>
      apiRequest<{ id: string }>(`/api/v1/class-arms/${classArmId}/class-teacher`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
  });
}
