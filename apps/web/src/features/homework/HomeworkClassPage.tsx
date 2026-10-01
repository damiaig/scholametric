import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Paperclip, Plus, Pencil, Trash2, FolderOpen } from "lucide-react";
import type { Homework } from "@scholametric/shared";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useDeleteHomework, useHomeworkList, usePublishHomework, useUnpublishHomework } from "./use-homework";
import { HomeworkFormDialog } from "./HomeworkFormDialog";
import { HomeworkDetailDialog } from "./HomeworkDetailDialog";

// v0.8.2 step 5 (SPEC_V0.8.2.md §6 item 5) — mirrors ClassGradesPage's own
// route-param/search-param shape: classArmId from the route, subjectId
// from the query string. termId is never a URL param — resolved from
// useMyTeaching().currentTermId, the SAME hook EnterScoresTab already
// uses for effectiveTermId. No new fetch for the class/subject LABEL
// either: useMyTeaching's own subjects[] already carries className/
// subjectName for every (classArmId, subjectId) pair this teacher teaches.
export function HomeworkClassPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const classArmId = id ?? "";
  const subjectId = searchParams.get("subjectId") ?? "";

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Homework | null>(null);
  // v0.8.2 bugfix pass — stores only the id, never the object: the
  // attachments dialog stays open WHILE a mutation (attach) runs, so the
  // homework object passed into it must be derived fresh from the live
  // list every render (below), not frozen into state at click-time. A
  // snapshotted object here would keep rendering stale attachments/
  // remaining-budget after a successful upload until the dialog is
  // closed and reopened — editing/deleting don't need this because both
  // dialogs close immediately on their own mutation's success.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Homework | null>(null);

  const teaching = useMyTeaching();
  const termId = teaching.data?.currentTermId ?? "";
  const entry = teaching.data?.subjects.find((s) => s.classArmId === classArmId && s.subjectId === subjectId);

  const canQuery = Boolean(classArmId && subjectId && termId);
  const homeworkQuery = useHomeworkList(canQuery ? { classArmId, subjectId, termId } : null);
  const publishHomework = usePublishHomework();
  const unpublishHomework = useUnpublishHomework();
  const deleteHomework = useDeleteHomework();

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
          <p className="text-sm text-muted">Open this page from the Homework list — a specific subject must be selected.</p>
        </CardContent>
      </Card>
    );
  }

  if (!termId) {
    return (
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-2 text-lg font-semibold text-text">No current term configured</h2>
          <p className="text-sm text-muted">Ask your school admin to set a current term before assigning homework.</p>
        </CardContent>
      </Card>
    );
  }

  const homework = homeworkQuery.data?.homework ?? [];
  const detail = homework.find((item) => item.id === detailId) ?? null;
  const pageTitle = entry ? `${entry.className} — ${entry.subjectName}` : "Homework";

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(item: Homework) {
    setEditing(item);
    setFormOpen(true);
  }

  function handleDelete() {
    if (!deleting) return;
    deleteHomework.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }

  return (
    <div>
      <PageHeader
        title="Homework"
        description={pageTitle}
        actions={
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            New homework
          </Button>
        }
      />

      {homeworkQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading homework…
        </div>
      )}

      {homeworkQuery.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">{getErrorMessage(homeworkQuery.error, "Couldn't load homework.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => homeworkQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {homeworkQuery.data && homework.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <FolderOpen className="h-8 w-8 text-muted" aria-hidden="true" />
            <p className="text-sm text-muted">No homework set yet for this class and subject.</p>
          </CardContent>
        </Card>
      )}

      {homeworkQuery.data && homework.length > 0 && (
        <div className="flex flex-col gap-3">
          {homework.map((item) => {
            const isPublished = item.status === "PUBLISHED";
            return (
              <Card key={item.id}>
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text">{item.title}</span>
                        <StatusBadge label={isPublished ? "Published" : "Draft"} tone={isPublished ? "success" : "neutral"} />
                        {item.requiresUpload && <StatusBadge label="Requires upload" tone="info" />}
                      </div>
                      <p className="mt-1 text-sm text-muted">Due {item.dueDate}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Edit ${item.title}`}
                        disabled={isPublished}
                        title={isPublished ? "Unpublish first to edit" : undefined}
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          isPublished ? unpublishHomework.mutate(item.id) : publishHomework.mutate(item.id)
                        }
                      >
                        {isPublished ? "Unpublish" : "Publish"}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setDetailId(item.id)}>
                        <Paperclip className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Attachments &amp; submissions
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Delete ${item.title}`}
                        className="text-danger hover:bg-danger/10"
                        disabled={isPublished}
                        title={isPublished ? "Unpublish first to delete" : undefined}
                        onClick={() => setDeleting(item)}
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

      <HomeworkFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        classArmId={classArmId}
        subjectId={subjectId}
        termId={termId}
        homework={editing}
      />

      <HomeworkDetailDialog open={detailId !== null} onClose={() => setDetailId(null)} homework={detail} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete homework"
        description={deleting ? `Delete "${deleting.title}"? This can't be undone.` : undefined}
        confirmLabel="Delete"
        confirmTone="danger"
        isConfirming={deleteHomework.isPending}
      >
        {deleteHomework.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(deleteHomework.error)}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
