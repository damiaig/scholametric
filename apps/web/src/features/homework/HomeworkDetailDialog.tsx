import { useRef, useState } from "react";
import { Paperclip, Download } from "lucide-react";
import type { Homework } from "@scholametric/shared";
import { HOMEWORK_ATTACHMENT_CAP_BYTES } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { getErrorMessage } from "../../lib/api-client";
import { useAttachHomeworkFile, getAttachErrorMessage } from "./use-homework-attachments";
import { useHomeworkSubmissions, useSubmissionDownloadUrl } from "./use-homework-submissions";

interface HomeworkDetailDialogProps {
  open: boolean;
  onClose: () => void;
  homework: Homework | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// v0.8.2 step 5 (SPEC_V0.8.2.md §6 item 5) — attachments + submissions for
// ONE homework item, in one dialog (split from HomeworkFormDialog, which
// only ever handles title/description/dueDate/requiresUpload — neither
// section here can exist before the homework itself does). No download
// link on the teacher's OWN attachments: Step 4 built a teacher-facing
// download-url route for SUBMISSIONS and a student-facing one for
// ATTACHMENTS, but never a teacher-facing attachments one — flagged in
// this step's own report rather than silently adding a backend route
// (this step is frontend-only, zero backend diff).
export function HomeworkDetailDialog({ open, onClose, homework }: HomeworkDetailDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const attachFile = useAttachHomeworkFile();
  const submissionsQuery = useHomeworkSubmissions(homework?.id ?? null);
  const downloadUrl = useSubmissionDownloadUrl();

  if (!homework) {
    return null;
  }

  const usedBytes = homework.attachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
  const remainingBytes = HOMEWORK_ATTACHMENT_CAP_BYTES - usedBytes;
  const capReached = remainingBytes <= 0;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !homework) return;
    setLocalError(null);
    attachFile.mutate(
      { homeworkId: homework.id, file },
      {
        onError: (error) => setLocalError(getAttachErrorMessage(error)),
        onSettled: () => {
          if (fileInputRef.current) fileInputRef.current.value = "";
        },
      },
    );
  }

  function handleDownload(submissionId: string) {
    if (!homework) return;
    downloadUrl.mutate(
      { homeworkId: homework.id, submissionId },
      { onSuccess: (data) => window.open(data.downloadUrl, "_blank", "noopener,noreferrer") },
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={`${homework.title} — attachments & submissions`} className="max-w-2xl">
      <div className="flex flex-col gap-6 p-6">
        <h2 className="text-lg font-semibold text-text">{homework.title}</h2>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text">Attachments</h3>

          {homework.attachments.length === 0 ? (
            <p className="text-sm text-muted">No files attached yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {homework.attachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center gap-2 text-sm text-text">
                  <Paperclip className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                  <span className="truncate">{attachment.fileName}</span>
                  <span className="text-xs text-muted">{formatBytes(attachment.sizeBytes)}</span>
                </li>
              ))}
            </ul>
          )}

          {capReached ? (
            <p className="rounded-md border border-dashed border-muted/30 p-3 text-xs text-muted">
              This homework has reached its 20MB attachment limit. Share a Google Drive link in the description, or compress/zip your files.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <input ref={fileInputRef} type="file" onChange={handleFileChange} disabled={attachFile.isPending} className="text-sm text-text" />
              {attachFile.isPending && <Spinner />}
            </div>
          )}
          {!capReached && (
            <p className="text-xs text-muted">{formatBytes(Math.max(remainingBytes, 0))} remaining of 20MB for this homework.</p>
          )}
          {localError && (
            <p role="alert" className="text-sm text-danger">
              {localError}
            </p>
          )}
        </section>

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
