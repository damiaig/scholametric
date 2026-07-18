import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateStudentInput, Student } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import { normalizeOptionalString } from "../../lib/normalize-optional";

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStudentInput) =>
      apiRequest<Student>("/api/v1/students", {
        method: "POST",
        body: {
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: normalizeOptionalString(input.middleName),
          gender: input.gender,
          dateOfBirth: input.dateOfBirth,
          guardianName: input.guardianName,
          guardianPhone: input.guardianPhone,
          guardianEmail: normalizeOptionalString(input.guardianEmail),
          address: normalizeOptionalString(input.address),
          classArmId: input.classArmId,
          admissionNumber: normalizeOptionalString(input.admissionNumber),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
}
