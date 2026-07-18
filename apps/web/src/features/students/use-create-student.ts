import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateStudentGuardianEntryInput, CreateStudentInput, Student } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import { normalizeOptionalString } from "../../lib/normalize-optional";

// `mode` is a client-only discriminant for the form's toggle — the backend
// only ever sees guardianId (existing) or firstName/lastName/phone (new),
// plus relationship/isPrimary either way.
function toBackendGuardian(entry: CreateStudentGuardianEntryInput) {
  if (entry.mode === "existing") {
    return { guardianId: entry.guardianId, relationship: entry.relationship, isPrimary: entry.isPrimary };
  }
  return {
    firstName: entry.firstName,
    lastName: entry.lastName,
    phone: entry.phone,
    email: normalizeOptionalString(entry.email),
    address: normalizeOptionalString(entry.address),
    relationship: entry.relationship,
    isPrimary: entry.isPrimary,
  };
}

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
          guardians: input.guardians.map(toBackendGuardian),
          classArmId: input.classArmId,
          admissionNumber: normalizeOptionalString(input.admissionNumber),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
}
