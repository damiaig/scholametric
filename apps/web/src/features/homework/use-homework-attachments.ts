import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { HomeworkAttachment, UploadUrlIssueResponse } from "@scholametric/shared";
import { ApiError, apiRequest } from "../../lib/api-client";

export interface AttachHomeworkFileInput {
  homeworkId: string;
  file: File;
}

// v0.8.2 step 5 (SPEC_V0.8.2.md §6 item 5) — the attach flow, orchestrated
// as ONE mutation across 3 steps so the calling component gets a single
// isPending/isError to render, not three:
//
//   1. request the upload URL (a normal apiRequest call)
//   2. PUT the file DIRECTLY to storage — a RAW fetch(), bypassing
//      apiRequest entirely: no Authorization header (the signed URL
//      itself is the authorization, not our JWT), no JSON body/
//      Content-Type override (apiRequest hardcodes both). GCS's V4 signed
//      URL was built (Step 3, FirebaseStorageService) WITH an
//      extensionHeaders entry — X-Goog-Content-Length-Range:
//      `0,${maxSizeBytes}` — and requires that EXACT header, byte-
//      identical, on the actual PUT or the signature fails to validate.
//      issued.maxSizeBytes is what the server used to build the
//      signature, so it must be echoed back here, not recomputed.
//   3. commit (a normal apiRequest call)
//
// A step-2 failure throws a PLAIN Error, deliberately NOT an ApiError —
// there is no structured API error body for a storage-layer network
// failure. getErrorMessage() only special-cases ApiError (it's shared by
// every other feature in this app; widening it here would be a scope
// creep this step doesn't need) — callers branch locally instead:
// `error instanceof ApiError ? getErrorMessage(error) : "The file upload
// failed. Check your connection and try again."`
export function useAttachHomeworkFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ homeworkId, file }: AttachHomeworkFileInput): Promise<HomeworkAttachment> => {
      const contentType = file.type || "application/octet-stream";

      const issued = await apiRequest<UploadUrlIssueResponse>(`/api/v1/homework/${homeworkId}/attachments/upload-url`, {
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

      return apiRequest<HomeworkAttachment>(`/api/v1/homework/${homeworkId}/attachments`, {
        method: "POST",
        body: { storageKey: issued.storageKey, fileName: file.name, contentType },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homework", "list"] });
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
