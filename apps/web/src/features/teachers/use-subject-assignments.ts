import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SubjectTeacherAssignment } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface CreateSubjectAssignmentInput {
  subjectId: string;
  classArmId: string;
  teacherUserId: string;
}

export function useCreateSubjectAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubjectAssignmentInput) =>
      apiRequest<SubjectTeacherAssignment>("/api/v1/subject-assignments", { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
  });
}

export function useRemoveSubjectAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ id: string }>(`/api/v1/subject-assignments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
    },
  });
}
