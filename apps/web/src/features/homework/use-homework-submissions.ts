import { useMutation, useQuery } from "@tanstack/react-query";
import type { DownloadUrlResponse, HomeworkSubmissionsView } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useHomeworkSubmissions(homeworkId: string | null) {
  return useQuery({
    queryKey: ["homework", "submissions", homeworkId],
    queryFn: () => apiRequest<HomeworkSubmissionsView>(`/api/v1/homework/${homeworkId}/submissions`),
    enabled: homeworkId !== null,
  });
}

// v0.8.2 step 5 — an on-demand action (not cached list data), so a plain
// mutation rather than a query: click a file, fetch its one-off signed
// download URL, open it. Two separate hooks (attachment vs. submission)
// since they're two separate backend routes with different authorization
// paths, even though the response shape is identical.
export function useSubmissionDownloadUrl() {
  return useMutation({
    mutationFn: ({ homeworkId, submissionId }: { homeworkId: string; submissionId: string }) =>
      apiRequest<DownloadUrlResponse>(`/api/v1/homework/${homeworkId}/submissions/${submissionId}/download-url`),
  });
}
