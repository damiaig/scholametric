import { useState } from "react";
import { Download, Paperclip } from "lucide-react";
import type { StudentHomeworkEntry } from "@scholametric/shared";
import { Card, CardContent } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Label } from "../../components/ui/label";
import { StatusBadge } from "../../components/StatusBadge";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";

const DESCRIPTION_TRUNCATE_LENGTH = 200;

// A plain YYYY-MM-DD string parsed as a LOCAL date at midnight — NOT
// `new Date(dueDate)`, which parses as UTC midnight and can format one day
// off in a negative-offset timezone. Mirrors styled-date-picker.tsx's own
// parseISODate (not exported from there, so re-declared locally rather
// than touching that unrelated file for one helper).
function formatDueDateHeading(dueDate: string): string {
  const [year, month, day] = dueDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function groupByDueDate(homework: StudentHomeworkEntry[]): Array<{ dueDate: string; items: StudentHomeworkEntry[] }> {
  const groups: Array<{ dueDate: string; items: StudentHomeworkEntry[] }> = [];
  for (const item of homework) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.dueDate === item.dueDate) {
      lastGroup.items.push(item);
    } else {
      groups.push({ dueDate: item.dueDate, items: [item] });
    }
  }
  return groups;
}

interface HomeworkDueDateListProps {
  homework: StudentHomeworkEntry[];
  /** false for the PARENT view — no mark-done checkbox, no upload control. */
  editable: boolean;
  onMarkDone?: (homeworkId: string, markedDone: boolean) => void;
  /**
   * Omitted for the PARENT view — GET /me/homework/:id/attachments/:
   * attachmentId/download-url is STUDENT-only server-side (no parent-
   * scoped equivalent exists yet, a gap found while documenting this
   * step rather than shipping a button that would 403). Attachments
   * still render as plain text (name visible) when this is undefined,
   * just not clickable.
   */
  onDownloadAttachment?: (homeworkId: string, attachmentId: string) => void;
  onUploadFile?: (homeworkId: string, file: File) => void;
  /** The homework this upload interaction is about — pending or just-failed. */
  activeUploadHomeworkId?: string | null;
  isUploading?: boolean;
  uploadError?: string | null;
}

// v0.8.2 step 6 (SPEC_V0.8.2.md §6 item 6) — the Pronote-style due-date-
// grouped display, shared between the STUDENT's own view and the PARENT's
// read-only per-child view (same "shared view component, mode via a
// prop" convention StudentReportCardView already established with its own
// examsViewer prop). Grouping happens here, client-side, over the flat
// array the backend already returns sorted by dueDate ascending — the
// spec's own "Pour lundi 28 sept" is Pronote's actual French UI quoted as
// a grouping reference, not a localization mandate for this English-
// language platform; headings render in English. Fait/Non fait stays as
// shipped in Step 5's teacher-facing submissions view, for consistency.
export function HomeworkDueDateList({
  homework,
  editable,
  onMarkDone,
  onDownloadAttachment,
  onUploadFile,
  activeUploadHomeworkId,
  isUploading,
  uploadError,
}: HomeworkDueDateListProps) {
  const [expandedDescriptionId, setExpandedDescriptionId] = useState<string | null>(null);
  const expandedItem = homework.find((item) => item.id === expandedDescriptionId) ?? null;

  if (homework.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-muted">No homework due right now.</p>
        </CardContent>
      </Card>
    );
  }

  const groups = groupByDueDate(homework);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.dueDate}>
          <h2 className="mb-2 text-sm font-semibold text-muted">Due {formatDueDateHeading(group.dueDate)}</h2>
          <div className="flex flex-col gap-3">
            {group.items.map((item) => {
              const isTruncated = item.description.length > DESCRIPTION_TRUNCATE_LENGTH;
              const isThisItemActive = activeUploadHomeworkId === item.id;
              const isThisItemUploading = isThisItemActive && Boolean(isUploading);
              const thisItemError = isThisItemActive && !isUploading ? uploadError : null;
              return (
                <Card key={item.id}>
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted">{item.subjectName}</p>
                        <p className="font-medium text-text">{item.title}</p>
                        <p className="text-xs text-muted">{item.teacherName}</p>
                      </div>
                      <StatusBadge label={item.markedDone ? "Fait" : "Non fait"} tone={item.markedDone ? "success" : "neutral"} />
                    </div>

                    <p className="line-clamp-3 text-sm text-text">{item.description}</p>
                    {isTruncated && (
                      <button
                        type="button"
                        className="self-start text-xs text-primary hover:underline"
                        onClick={() => setExpandedDescriptionId(item.id)}
                      >
                        View more
                      </button>
                    )}

                    {item.attachments.length > 0 && (
                      <ul className="flex flex-col gap-1">
                        {item.attachments.map((attachment) =>
                          onDownloadAttachment ? (
                            <li key={attachment.id}>
                              <button
                                type="button"
                                onClick={() => onDownloadAttachment(item.id, attachment.id)}
                                className="flex items-center gap-1.5 text-left text-sm text-primary hover:underline"
                              >
                                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                                {attachment.fileName}
                              </button>
                            </li>
                          ) : (
                            <li key={attachment.id} className="flex items-center gap-1.5 text-sm text-text">
                              <Paperclip className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                              {attachment.fileName}
                            </li>
                          ),
                        )}
                      </ul>
                    )}

                    {editable && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`mark-done-${item.id}`}
                          checked={item.markedDone}
                          onChange={(event) => onMarkDone?.(item.id, event.target.checked)}
                        />
                        <Label htmlFor={`mark-done-${item.id}`}>J&apos;ai terminé</Label>
                      </div>
                    )}

                    {editable && (
                      <div className="flex flex-col gap-1.5">
                        {item.submissions.length > 0 && (
                          <ul className="flex flex-col gap-1">
                            {item.submissions.map((submission) => (
                              <li key={submission.id} className="flex items-center gap-1.5 text-xs text-muted">
                                <Download className="h-3 w-3" aria-hidden="true" />
                                {submission.fileName}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            disabled={isThisItemUploading}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) onUploadFile?.(item.id, file);
                              event.target.value = "";
                            }}
                            className="text-xs text-text"
                          />
                          {isThisItemUploading && <Spinner className="h-3.5 w-3.5" />}
                        </div>
                        {thisItemError && <p className="text-xs text-danger">{thisItemError}</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      <Dialog open={expandedItem !== null} onClose={() => setExpandedDescriptionId(null)} title={expandedItem?.title ?? "Homework"}>
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold text-text">{expandedItem?.title}</h2>
          <p className="whitespace-pre-wrap text-sm text-text">{expandedItem?.description}</p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setExpandedDescriptionId(null)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
