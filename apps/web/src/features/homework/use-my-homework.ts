import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DownloadUrlResponse, HomeworkCompletionResponse, StudentHomeworkListResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.8.2 step 6 (SPEC_V0.8.2.md §6 item 6) — GET /me/homework: no
// classArmId/termId param anywhere (both resolved server-side from the
// caller's own current enrollment/term), same "self, resolved from the
// token" shape as useMyReportCard.
export function useMyHomework() {
  return useQuery({
    queryKey: ["me", "homework"],
    queryFn: () => apiRequest<StudentHomeworkListResponse>("/api/v1/me/homework"),
  });
}

// GET /me/children/:childId/homework — same shape as useChildReportCard;
// childId is validated server-side (assertChildBelongsToCaller) before
// any homework query runs.
export function useChildHomework(childId: string | null) {
  return useQuery({
    queryKey: childId ? ["me", "children", childId, "homework"] : ["me", "children", "homework", "disabled"],
    queryFn: () => apiRequest<StudentHomeworkListResponse>(`/api/v1/me/children/${childId}/homework`),
    enabled: childId !== null,
  });
}

// POST /me/homework/:id/complete — toggles either direction through this
// one call, same as the backend's own setCompletion. STUDENT only; no
// child-on-behalf-of equivalent (PARENT is read-only, ruled at plan time
// in Step 2 and reconfirmed this step).
export function useMarkHomeworkDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ homeworkId, markedDone }: { homeworkId: string; markedDone: boolean }) =>
      apiRequest<HomeworkCompletionResponse>(`/api/v1/me/homework/${homeworkId}/complete`, { method: "POST", body: { markedDone } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me", "homework"] });
    },
  });
}

// An on-demand action (not cached list data), same shape as Step 5's
// useSubmissionDownloadUrl — click a teacher's attachment, fetch its
// one-off signed download URL, open it.
export function useMyAttachmentDownloadUrl() {
  return useMutation({
    mutationFn: ({ homeworkId, attachmentId }: { homeworkId: string; attachmentId: string }) =>
      apiRequest<DownloadUrlResponse>(`/api/v1/me/homework/${homeworkId}/attachments/${attachmentId}/download-url`),
  });
}

// v0.8.2 step 7 (SPEC_V0.8.2.md §6 item 7) — the parent-side counterpart
// to useMyAttachmentDownloadUrl above, closing Step 6's flagged gap (the
// STUDENT-only route above would 403 for a parent caller).
export function useChildAttachmentDownloadUrl() {
  return useMutation({
    mutationFn: ({ childId, homeworkId, attachmentId }: { childId: string; homeworkId: string; attachmentId: string }) =>
      apiRequest<DownloadUrlResponse>(`/api/v1/me/children/${childId}/homework/${homeworkId}/attachments/${attachmentId}/download-url`),
  });
}
