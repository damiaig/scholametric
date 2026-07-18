import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddGuardianInput, EditGuardianInput, StudentGuardianSummary } from "@scholametric/shared";
import { apiRequest } from "../../../lib/api-client";
import { normalizeOptionalString } from "../../../lib/normalize-optional";

export function useStudentGuardians(studentId: string) {
  return useQuery({
    queryKey: ["students", studentId, "guardians"],
    queryFn: () => apiRequest<StudentGuardianSummary[]>(`/api/v1/students/${studentId}/guardians`),
  });
}

function invalidateStudent(queryClient: ReturnType<typeof useQueryClient>, studentId: string) {
  queryClient.invalidateQueries({ queryKey: ["students", studentId, "guardians"] });
  queryClient.invalidateQueries({ queryKey: ["students", "detail", studentId] });
  queryClient.invalidateQueries({ queryKey: ["students"] });
}

// `mode` is a client-only discriminant, stripped before the request — same
// convention as use-create-student.ts.
function toBackendGuardian(input: AddGuardianInput) {
  if (input.mode === "existing") {
    return { guardianId: input.guardianId, relationship: input.relationship };
  }
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    email: normalizeOptionalString(input.email),
    address: normalizeOptionalString(input.address),
    relationship: input.relationship,
  };
}

export function useAddGuardian(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddGuardianInput) =>
      apiRequest<StudentGuardianSummary>(`/api/v1/students/${studentId}/guardians`, {
        method: "POST",
        body: toBackendGuardian(input),
      }),
    onSuccess: () => invalidateStudent(queryClient, studentId),
  });
}

export function useUpdateGuardian(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guardianId, input }: { guardianId: string; input: EditGuardianInput }) =>
      apiRequest<StudentGuardianSummary>(`/api/v1/guardians/${guardianId}`, {
        method: "PATCH",
        body: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          email: normalizeOptionalString(input.email),
          address: normalizeOptionalString(input.address),
        },
      }),
    onSuccess: () => invalidateStudent(queryClient, studentId),
  });
}

export function useSetPrimaryGuardian(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guardianId: string) =>
      apiRequest<StudentGuardianSummary>(`/api/v1/students/${studentId}/guardians/${guardianId}/primary`, {
        method: "PUT",
      }),
    onSuccess: () => invalidateStudent(queryClient, studentId),
  });
}

export function useRemoveGuardian(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guardianId, force }: { guardianId: string; force?: boolean }) =>
      apiRequest<{ id: string }>(`/api/v1/students/${studentId}/guardians/${guardianId}`, {
        method: "DELETE",
        query: force ? { force: "true" } : undefined,
      }),
    onSuccess: () => invalidateStudent(queryClient, studentId),
  });
}
