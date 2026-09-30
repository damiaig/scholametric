import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { HomeworkSubmission, UploadUrlIssueResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface SubmitMyHomeworkFileInput {
  homeworkId: string;
  file: File;
}

// v0.8.2 step 6 (SPEC_V0.8.2.md §6 item 6) — REUSES Step 5's
// useAttachHomeworkFile flow verbatim (see use-homework-attachments.ts's
// own doc comment for the full X-Goog-Content-Length-Range rationale),
// pointed at the student submissions endpoints instead of the teacher
// attachments ones. Not a reimplementation — same 3 steps, same raw
// fetch() bypassing apiRequest, same byte-identical cap header echoed
// from the server's own issued response. Error branching reuses
// getAttachErrorMessage directly (role-agnostic — it only distinguishes
// ApiError from a plain storage-layer Error).
export function useSubmitMyHomeworkFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ homeworkId, file }: SubmitMyHomeworkFileInput): Promise<HomeworkSubmission> => {
      const contentType = file.type || "application/octet-stream";

      const issued = await apiRequest<UploadUrlIssueResponse>(`/api/v1/me/homework/${homeworkId}/submissions/upload-url`, {
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

      return apiRequest<HomeworkSubmission>(`/api/v1/me/homework/${homeworkId}/submissions`, {
        method: "POST",
        body: { storageKey: issued.storageKey, fileName: file.name, contentType },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me", "homework"] });
    },
  });
}
