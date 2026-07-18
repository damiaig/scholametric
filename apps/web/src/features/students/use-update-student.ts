import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Student, UpdateStudentInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import { normalizeOptionalString } from "../../lib/normalize-optional";

export function useUpdateStudent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStudentInput) =>
      apiRequest<Student>(`/api/v1/students/${id}`, {
        method: "PATCH",
        body: {
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: normalizeOptionalString(input.middleName),
          gender: input.gender,
          dateOfBirth: input.dateOfBirth,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs", "student", id] });
    },
  });
}
