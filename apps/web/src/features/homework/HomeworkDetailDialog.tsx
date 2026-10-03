import { Download } from "lucide-react";
import type { Homework } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { getErrorMessage } from "../../lib/api-client";
import { useHomeworkSubmissions, useSubmissionDownloadUrl } from "./use-homework-submissions";

interface HomeworkDetailDialogProps {
  open: boolean;
  onClose: () => void;
  homework: Homework | null;
}

// v0.8.3 step 2 (SPEC_V0.8.3.md §2.2, Item 2) — this dialog is now the
// teacher's Submissions-only view; teacher attachments moved into
// HomeworkFormDialog (Item 1). The roster below is unchanged from v0.8.2
// step 5/6.
export function HomeworkDetailDialog({ open, onClose, homework }: HomeworkDetailDialogProps) {
  const submissionsQuery = useHomeworkSubmissions(homework?.id ?? null);
  const downloadUrl = useSubmissionDownloadUrl();

  if (!homework) {
    return null;
  }

  function handleDownload(submissionId: string) {
    if (!homework) return;
    downloadUrl.mutate(
      { homeworkId: homework.id, submissionId },
      { onSuccess: (data) => window.open(data.downloadUrl, "_blank", "noopener,noreferrer") },
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={`${homework.title} — submissions`} className="max-w-2xl">
      <div className="flex flex-col gap-6 p-6">
        <h2 className="text-lg font-semibold text-text">{homework.title}</h2>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text">Submissions</h3>

          {submissionsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Loading submissions…
            </div>
          )}
          {submissionsQuery.isError && <p className="text-sm text-danger">{getErrorMessage(submissionsQuery.error, "Couldn't load submissions.")}</p>}

          {submissionsQuery.data && (
            <div className="overflow-hidden rounded-md border border-muted/20">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-muted/20">
                    <th className="px-3 py-2 font-medium text-muted">Student</th>
                    <th className="px-3 py-2 font-medium text-muted">Status</th>
                    <th className="px-3 py-2 font-medium text-muted">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {submissionsQuery.data.students.map((student) => (
                    <tr key={student.studentId} className="border-b border-muted/10 last:border-0">
                      <td className="px-3 py-2 text-text">{student.studentName}</td>
                      <td className="px-3 py-2">
                        <StatusBadge label={student.markedDone ? "Done" : "Not done"} tone={student.markedDone ? "success" : "neutral"} />
                      </td>
                      <td className="px-3 py-2">
                        {student.submissions.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {student.submissions.map((submission) => (
                              <button
                                key={submission.id}
                                type="button"
                                onClick={() => handleDownload(submission.id)}
                                className="flex items-center gap-1.5 text-left text-primary hover:underline"
                              >
                                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                {submission.fileName}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
