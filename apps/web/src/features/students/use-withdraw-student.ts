import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Student, WithdrawStudentInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useWithdrawStudent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WithdrawStudentInput) =>
      apiRequest<Student>(`/api/v1/students/${id}/withdraw`, { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs", "student", id] });
    },
  });
}
