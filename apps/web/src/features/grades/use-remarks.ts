import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReportCardResponse, RemarkResponse, WriteRemarkInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import { reportCardQueryKey } from "./use-report-card";

interface WriteRemarkVariables {
  studentId: string;
  input: WriteRemarkInput;
  // RemarkResponse only carries the author's id (not their name) — the
  // caller already has their own name via useCurrentUser() (they're always
  // the one being stamped), so it rides along here purely for the
  // immediate cache patch below. The background refetch (queryClient
  // .invalidateQueries) lands the server's own authoritative name right
  // after, which will always match — same person, just confirmed.
  authorName: { firstName: string; lastName: string };
}

function patchRemark(
  queryClient: ReturnType<typeof useQueryClient>,
  variables: WriteRemarkVariables,
  data: RemarkResponse,
  field: "teacher" | "principal",
) {
  const key = reportCardQueryKey({ studentId: variables.studentId, termId: data.termId, sessionId: data.sessionId });
  queryClient.setQueryData<ReportCardResponse>(key, (old) => {
    if (!old) return old;
    const remarkText = field === "teacher" ? data.teacherRemark : data.principalRemark;
    const remarkAt = field === "teacher" ? data.teacherRemarkAt : data.principalRemarkAt;
    return {
      ...old,
      remarks: {
        ...old.remarks,
        ...(field === "teacher"
          ? { teacherRemark: remarkText, teacherRemarkAt: remarkAt, teacherRemarkBy: remarkText ? variables.authorName : null }
          : { principalRemark: remarkText, principalRemarkAt: remarkAt, principalRemarkBy: remarkText ? variables.authorName : null }),
      },
    };
  });
  queryClient.invalidateQueries({ queryKey: key });
}

// Class-teacher-only for TEACHER, unrestricted for SCHOOL_ADMIN/PROPRIETOR
// (SPEC_V0.5.md §2.4/Q6, v0.5 step 6) — visibility of the form itself is
// the caller's job (ReportCardPage), this hook just performs the write.
export function useWriteTeacherRemark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, input }: WriteRemarkVariables) =>
      apiRequest<RemarkResponse>(`/api/v1/students/${studentId}/remarks/teacher`, { method: "PUT", body: input }),
    onSuccess: (data, variables) => patchRemark(queryClient, variables, data, "teacher"),
  });
}

// SCHOOL_ADMIN/PROPRIETOR only server-side (categorical 403 for TEACHER) —
// same cache-patch shape as the teacher remark above.
export function useWritePrincipalRemark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, input }: WriteRemarkVariables) =>
      apiRequest<RemarkResponse>(`/api/v1/students/${studentId}/remarks/principal`, { method: "PUT", body: input }),
    onSuccess: (data, variables) => patchRemark(queryClient, variables, data, "principal"),
  });
}
