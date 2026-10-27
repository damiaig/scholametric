import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, FolderOpen } from "lucide-react";
import type { Lesson } from "@scholametric/shared";
import { BackLink } from "../../components/BackLink";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { formatDueDateRelative } from "../../lib/format-date";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useDeleteLesson, useLessonList, usePublishLesson, useUnpublishLesson } from "./use-lessons";
import { LessonFormDialog } from "./LessonFormDialog";
import { LessonFilterBar } from "./LessonFilterBar";
import { filterByWeek } from "./lesson-filters";

// v0.8.4 step 4 (SPEC_V0.8.4.md §6 step 4) — mirrors HomeworkClassPage's
// own route-param/search-param shape, minus termId (Lesson has none — no
// "no current term configured" empty state here either). The list
// already arrives newest-lessonDate-first from the backend
// (listLessons's own orderBy) — no client-side sort needed. No
// Submissions button — there's no roster/per-student state to show at
// all for a read-only Lesson.

interface LessonListFilteredProps {
  lessons: Lesson[];
  onEdit: (item: Lesson) => void;
  onTogglePublish: (item: Lesson) => void;
  onDelete: (item: Lesson) => void;
}

// v0.8.4 Lessons Read Polish (SPEC_V0.8.4_read_polish.md §2/§3/§4) — the
// filter bar + the (already-filtered) card list, extracted so
// LessonClassPage can render it keyed by classArmId+subjectId: switching
// to a different class+subject page remounts this fresh, resetting local
// filter state (the same reasoning MyLessonsPage.tsx's LessonFilteredList
// applies per-child). subjects={[]} always — this page is already scoped
// to exactly one subject by construction (reached from one class+subject
// cell on the landing table), and the teacher-facing Lesson type carries
// no subjectName at all; LessonFilterBar hides its subject control
// whenever there's ≤1 option, which is therefore always true here, with
// no "is this the teacher page" branch anywhere.
function LessonListFiltered({ lessons, onEdit, onTogglePublish, onDelete }: LessonListFilteredProps) {
  const [weekAnchor, setWeekAnchor] = useState("");
  // No filterBySubjectId call — there's never a subject to filter by here
  // (see the component doc comment above).
  const filtered = filterByWeek(lessons, weekAnchor);

  return (
    <>
      <LessonFilterBar subjects={[]} selectedSubjectId="" onSubjectChange={() => {}} weekAnchor={weekAnchor} onWeekAnchorChange={setWeekAnchor} onReset={() => setWeekAnchor("")} />

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <FolderOpen className="h-8 w-8 text-muted" aria-hidden="true" />
            <p className="text-sm text-muted">
              {lessons.length > 0 ? "No lessons match these filters." : "No lessons logged yet for this class and subject."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => {
            const isPublished = item.status === "PUBLISHED";
            return (
              <Card key={item.id}>
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text">{item.title}</span>
                        <StatusBadge label={isPublished ? "Published" : "Draft"} tone={isPublished ? "success" : "neutral"} />
                      </div>
                      <p className="mt-1 text-sm text-muted">{formatDueDateRelative(item.lessonDate)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Edit ${item.title}`}
                        disabled={isPublished}
                        title={isPublished ? "Unpublish first to edit" : undefined}
                        onClick={() => onEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => onTogglePublish(item)}>
                        {isPublished ? "Unpublish" : "Publish"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Delete ${item.title}`}
                        className="text-danger hover:bg-danger/10"
                        disabled={isPublished}
                        title={isPublished ? "Unpublish first to delete" : undefined}
                        onClick={() => onDelete(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export function LessonClassPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const classArmId = id ?? "";
  const subjectId = searchParams.get("subjectId") ?? "";

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [deleting, setDeleting] = useState<Lesson | null>(null);

  const teaching = useMyTeaching();
  const entry = teaching.data?.subjects.find((s) => s.classArmId === classArmId && s.subjectId === subjectId);

  const canQuery = Boolean(classArmId && subjectId);
  const lessonQuery = useLessonList(canQuery ? { classArmId, subjectId } : null);
  const publishLesson = usePublishLesson();
  const unpublishLesson = useUnpublishLesson();
  const deleteLesson = useDeleteLesson();

  if (teaching.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading…
      </div>
    );
  }

  if (!subjectId) {
    return (
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-2 text-lg font-semibold text-text">No subject selected</h2>
          <p className="text-sm text-muted">Open this page from the Lessons list — a specific subject must be selected.</p>
        </CardContent>
      </Card>
    );
  }

  const lessons = lessonQuery.data?.lessons ?? [];
  const pageTitle = entry ? `${entry.className} — ${entry.subjectName}` : "Lessons";

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(item: Lesson) {
    setEditing(item);
    setFormOpen(true);
  }

  function handleDelete() {
    if (!deleting) return;
    deleteLesson.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }

  return (
    <div>
      <BackLink to="/lessons" label="Back to Lessons" className="mb-4" />

      <PageHeader
        title="Lessons"
        description={pageTitle}
        actions={
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            New lesson
          </Button>
        }
      />

      {lessonQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading lessons…
        </div>
      )}

      {lessonQuery.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">{getErrorMessage(lessonQuery.error, "Couldn't load lessons.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => lessonQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {lessonQuery.data && (
        <LessonListFiltered
          key={`${classArmId}-${subjectId}`}
          lessons={lessons}
          onEdit={openEdit}
          onTogglePublish={(item) => (item.status === "PUBLISHED" ? unpublishLesson.mutate(item.id) : publishLesson.mutate(item.id))}
          onDelete={setDeleting}
        />
      )}

      <LessonFormDialog open={formOpen} onClose={() => setFormOpen(false)} classArmId={classArmId} subjectId={subjectId} lesson={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete lesson"
        description={deleting ? `Delete "${deleting.title}"? This can't be undone.` : undefined}
        confirmLabel="Delete"
        confirmTone="danger"
        isConfirming={deleteLesson.isPending}
      >
        {deleteLesson.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(deleteLesson.error)}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
