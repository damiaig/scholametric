import { useState } from "react";
import { Download } from "lucide-react";
import type { Homework, HomeworkSubmissionsView } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { getErrorMessage } from "../../lib/api-client";
import { formatBytes } from "../../lib/format-bytes";
import { formatDateTime } from "../../lib/format-date";
import { useHomeworkSubmissions, useSubmissionDownloadUrl } from "./use-homework-submissions";

interface HomeworkDetailDialogProps {
  open: boolean;
  onClose: () => void;
  homework: Homework | null;
}

type StudentSubmissions = HomeworkSubmissionsView["students"][number];

// v0.8.3 step 3 (SPEC_V0.8.3.md §2.5, Item 5) — a view-SWAP within this
// one dialog, not a second nested Dialog: Dialog's backdrop onClick has
// no stopPropagation, so a second instance would double-fire on both
// Escape (two document keydown listeners) and a backdrop click (React's
// synthetic events bubble the component tree, not the DOM tree, so a
// click on the inner backdrop would also reach the outer one's onClose
// across the portal boundary). viewingStudentId swaps the roster for one
// student's detail instead — same query data, same download mutation,
// no new fetch.
export function HomeworkDetailDialog({ open, onClose, homework }: HomeworkDetailDialogProps) {
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);
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

  const viewingStudent = submissionsQuery.data?.students.find((student) => student.studentId === viewingStudentId) ?? null;

  return (
    <Dialog open={open} onClose={onClose} title={`${homework.title} — submissions`} className="max-w-2xl">
      <div className="flex flex-col gap-6 p-6">
        <h2 className="text-lg font-semibold text-text">{homework.title}</h2>

        {viewingStudent ? (
          <SubmissionDetail student={viewingStudent} onBack={() => setViewingStudentId(null)} onDownload={handleDownload} />
        ) : (
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-text">Submissions</h3>

            {submissionsQuery.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> Loading submissions…
              </div>
            )}
            {submissionsQuery.isError && (
              <p className="text-sm text-danger">{getErrorMessage(submissionsQuery.error, "Couldn't load submissions.")}</p>
            )}

            {submissionsQuery.data && (
              <>
                {/* Mobile: cards (CLAUDE.md §6 — tables collapse to cards below sm),
                    same pattern ClassArmDetailPage's subject-teacher table already uses. */}
                <div className="flex flex-col gap-2 sm:hidden">
                  {submissionsQuery.data.students.map((student) => (
                    <StudentCard key={student.studentId} student={student} onView={() => setViewingStudentId(student.studentId)} />
                  ))}
                </div>

                <div className="hidden overflow-hidden rounded-md border border-muted/20 sm:block">
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
                          <td className="px-3 py-2">
                            <StudentNameTrigger student={student} onView={() => setViewingStudentId(student.studentId)} />
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge label={student.markedDone ? "Done" : "Not done"} tone={student.markedDone ? "success" : "neutral"} />
                          </td>
                          <td className="px-3 py-2">
                            {student.submissions.length === 0 ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <div className="flex flex-col gap-1 text-text">
                                {student.submissions.map((submission) => (
                                  <span key={submission.id} className="truncate">
                                    {submission.fileName}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function StudentNameTrigger({ student, onView }: { student: StudentSubmissions; onView: () => void }) {
  if (student.submissions.length === 0) {
    return <span className="text-text">{student.studentName}</span>;
  }
  return (
    <button type="button" onClick={onView} className="text-left text-primary hover:underline">
      {student.studentName}
    </button>
  );
}

function StudentCard({ student, onView }: { student: StudentSubmissions; onView: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-muted/20 bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <StudentNameTrigger student={student} onView={onView} />
        <StatusBadge label={student.markedDone ? "Done" : "Not done"} tone={student.markedDone ? "success" : "neutral"} />
      </div>
      {student.submissions.length === 0 ? (
        <span className="text-xs text-muted">No files submitted.</span>
      ) : (
        <div className="flex flex-col gap-0.5">
          {student.submissions.map((submission) => (
            <span key={submission.id} className="truncate text-xs text-muted">
              {submission.fileName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SubmissionDetail({
  student,
  onBack,
  onDownload,
}: {
  student: StudentSubmissions;
  onBack: () => void;
  onDownload: (submissionId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm text-primary hover:underline">
        ← Back to all submissions
      </button>

      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text">{student.studentName}</h3>
        <StatusBadge label={student.markedDone ? "Done" : "Not done"} tone={student.markedDone ? "success" : "neutral"} />
      </div>
      {student.markedDone && student.markedAt && <p className="text-xs text-muted">Marked done {formatDateTime(student.markedAt)}</p>}

      {student.submissions.length === 0 ? (
        <p className="text-sm text-muted">No files submitted.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {student.submissions.map((submission) => (
            <li key={submission.id} className="flex items-center justify-between gap-3 rounded-md border border-muted/10 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-text">{submission.fileName}</p>
                <p className="text-xs text-muted">
                  <span className="font-mono">{formatBytes(submission.sizeBytes)}</span> · Uploaded {formatDateTime(submission.uploadedAt)}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => onDownload(submission.id)}>
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
