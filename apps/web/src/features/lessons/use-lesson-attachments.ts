import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LessonAttachment, LessonUploadUrlIssueResponse } from "@scholametric/shared";
import { ApiError, apiRequest } from "../../lib/api-client";

export interface AttachLessonFileInput {
  lessonId: string;
  file: File;
}

// v0.8.4 step 4 (SPEC_V0.8.4.md §6 step 4) — mirrors use-homework-
// attachments.ts's own 3-step orchestration exactly (issue → raw PUT to
// storage → commit), duplicated rather than imported (this feature's own
// "duplicate, don't cross-import" convention, kept even for this file's
// trivial getAttachErrorMessage helper below). See that file's own doc
// comment for why step 2 throws a plain Error, not an ApiError.
export function useAttachLessonFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ lessonId, file }: AttachLessonFileInput): Promise<LessonAttachment> => {
      const contentType = file.type || "application/octet-stream";

      const issued = await apiRequest<LessonUploadUrlIssueResponse>(`/api/v1/lessons/${lessonId}/attachments/upload-url`, {
        method: "POST",
        body: { fileName: file.name, contentType },
      });

      const putResponse = await fetch(issued.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "X-Goog-Content-Length-Range": `0,${issued.maxSizeBytes}`,
        },
        body: file,
      });
      if (!putResponse.ok) {
        throw new Error("The file upload failed. Check your connection and try again.");
      }

      return apiRequest<LessonAttachment>(`/api/v1/lessons/${lessonId}/attachments`, {
        method: "POST",
        body: { storageKey: issued.storageKey, fileName: file.name, contentType },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons", "list"] });
    },
  });
}

export function useDeleteLessonAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, attachmentId }: { lessonId: string; attachmentId: string }) =>
      apiRequest<{ id: string }>(`/api/v1/lessons/${lessonId}/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons", "list"] });
    },
  });
}

/** CLAUDE.md §6: readable sentences — the attach flow's own error branch (see the hook's doc comment above for why this can't just be getErrorMessage). */
export function getAttachErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message || "Something went wrong. Please try again.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
