import { useMutation, useQuery } from "@tanstack/react-query";
import type { LessonDownloadUrlResponse, StudentLessonListResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.8.4 step 5 (SPEC_V0.8.4.md §6 step 5) — mirrors use-my-homework.ts's
// own read-side hooks exactly, minus useMarkHomeworkDone — there is no
// write path for Lessons at all, so no analog exists for it here.

export function useMyLessons() {
  return useQuery({
    queryKey: ["me", "lessons"],
    queryFn: () => apiRequest<StudentLessonListResponse>("/api/v1/me/lessons"),
  });
}

export function useChildLessons(childId: string | null) {
  return useQuery({
    queryKey: childId ? ["me", "children", childId, "lessons"] : ["me", "children", "lessons", "disabled"],
    queryFn: () => apiRequest<StudentLessonListResponse>(`/api/v1/me/children/${childId}/lessons`),
    enabled: childId !== null,
  });
}

export function useMyLessonAttachmentDownloadUrl() {
  return useMutation({
    mutationFn: ({ lessonId, attachmentId }: { lessonId: string; attachmentId: string }) =>
      apiRequest<LessonDownloadUrlResponse>(`/api/v1/me/lessons/${lessonId}/attachments/${attachmentId}/download-url`),
  });
}

export function useChildLessonAttachmentDownloadUrl() {
  return useMutation({
    mutationFn: ({ childId, lessonId, attachmentId }: { childId: string; lessonId: string; attachmentId: string }) =>
      apiRequest<LessonDownloadUrlResponse>(`/api/v1/me/children/${childId}/lessons/${lessonId}/attachments/${attachmentId}/download-url`),
  });
}
