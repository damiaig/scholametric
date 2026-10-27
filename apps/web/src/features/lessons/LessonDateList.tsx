import { useState } from "react";
import { Paperclip } from "lucide-react";
import type { StudentLessonEntry } from "@scholametric/shared";
import { Card, CardContent } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { formatDueDateRelative } from "../../lib/format-date";

const BODY_TRUNCATE_LENGTH = 200;

function groupByLessonDate(lessons: StudentLessonEntry[]): Array<{ lessonDate: string; items: StudentLessonEntry[] }> {
  const groups: Array<{ lessonDate: string; items: StudentLessonEntry[] }> = [];
  for (const item of lessons) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.lessonDate === item.lessonDate) {
      lastGroup.items.push(item);
    } else {
      groups.push({ lessonDate: item.lessonDate, items: [item] });
    }
  }
  return groups;
}

interface LessonDateListProps {
  /** Already filtered by the caller (see lesson-filters.ts) — this component never filters. */
  lessons: StudentLessonEntry[];
  /**
   * v0.8.2 step 6 found this optional (the PARENT view had no matching
   * backend route at first) — stays optional here too for the general
   * contract, though both the STUDENT and PARENT callers in
   * MyLessonsPage.tsx always pass one. Plain text is the correct
   * fallback for any future caller with nothing to wire it to.
   */
  onDownloadAttachment?: (lessonId: string, attachmentId: string) => void;
  /**
   * v0.8.4 Lessons Read Polish (SPEC_V0.8.4_read_polish.md §4) — whether
   * the UNFILTERED list the caller fetched was non-empty. Distinguishes
   * "the filters narrowed everything out" (true) from "nothing has ever
   * been published" (false, the default) when `lessons` (already
   * filtered) is empty.
   */
  hasUnfilteredLessons?: boolean;
}

// v0.8.4 step 5 (SPEC_V0.8.4.md §6 step 5) — the cahier-de-textes read
// display, shared between the STUDENT's own view and the PARENT's
// read-only per-child view, mirroring HomeworkDueDateList's own shape.
// Genuinely read-only, structurally: no `editable` prop exists at all
// (unlike HomeworkDueDateList, where `editable={false}` is how the
// PARENT path opts out) — there is no onMarkDone/onUploadFile/
// onDeleteSubmission in this interface, and no Checkbox/StyledFileInput
// import in this file, because there is nothing for a Lesson to mark
// done or upload. Grouping happens here, client-side, over the flat
// array the backend already returns sorted by lessonDate DESCENDING
// (newest first — the cahier-de-textes order, the inverse of Homework's
// ascending due-date order). No "Due"/"Logged" prefix on the heading
// (ruled at plan time) — the bare relative date, matching Step 4's own
// teacher-list inversion.
export function LessonDateList({ lessons, onDownloadAttachment, hasUnfilteredLessons = false }: LessonDateListProps) {
  const [expandedBodyId, setExpandedBodyId] = useState<string | null>(null);
  const expandedItem = lessons.find((item) => item.id === expandedBodyId) ?? null;

  if (lessons.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-muted">{hasUnfilteredLessons ? "No lessons match these filters." : "No lessons published yet."}</p>
        </CardContent>
      </Card>
    );
  }

  const groups = groupByLessonDate(lessons);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.lessonDate}>
          <h2 className="mb-2 text-sm font-semibold text-muted">{formatDueDateRelative(group.lessonDate)}</h2>
          <div className="flex flex-col gap-3">
            {group.items.map((item) => {
              const isTruncated = item.body.length > BODY_TRUNCATE_LENGTH;
              return (
                <Card key={item.id}>
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">{item.subjectName}</p>
                      <p className="font-medium text-text">{item.title}</p>
                      <p className="text-xs text-muted">{item.teacherName}</p>
                    </div>

                    {/* v0.8.4 Lessons Read Polish (SPEC_V0.8.4_read_polish.md §1) — break-words
                        (overflow-wrap: break-word), not break-all: breaks an otherwise-
                        unbreakable token only when needed to avoid overflow, leaving normal
                        multi-word prose alone. A walk-found defect: a long unbroken string
                        (no spaces) previously overflowed the card horizontally. */}
                    <p className="line-clamp-3 break-words text-sm text-text">{item.body}</p>
                    {isTruncated && (
                      <button
                        type="button"
                        className="self-start text-xs text-primary hover:underline"
                        onClick={() => setExpandedBodyId(item.id)}
                      >
                        View more
                      </button>
                    )}

                    {item.attachments.length > 0 && (
                      <ul className="flex flex-col gap-1.5">
                        {item.attachments.map((attachment) =>
                          onDownloadAttachment ? (
                            <li key={attachment.id} className="rounded-md border border-muted/10 px-3 py-2">
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
                            <li key={attachment.id} className="flex items-center gap-1.5 rounded-md border border-muted/10 px-3 py-2 text-sm text-text">
                              <Paperclip className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                              {attachment.fileName}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      <Dialog open={expandedItem !== null} onClose={() => setExpandedBodyId(null)} title={expandedItem?.title ?? "Lesson"}>
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold text-text">{expandedItem?.title}</h2>
          <p className="whitespace-pre-wrap break-words text-sm text-text">{expandedItem?.body}</p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setExpandedBodyId(null)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
