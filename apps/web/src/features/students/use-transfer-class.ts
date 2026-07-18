import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Student, TransferClassInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useTransferClass(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferClassInput) =>
      apiRequest<Student>(`/api/v1/students/${id}/transfer-class`, { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs", "student", id] });
    },
  });
}
