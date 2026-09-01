import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { useDeleteExam, useExams } from "./use-exams";
import { ExamFormDialog } from "./ExamFormDialog";
import { TermLockBanner } from "./TermLockBanner";

interface ExamPickerProps {
  classArmId: string;
  subjectId: string;
  termId: string;
  value: string;
  onChange: (examId: string) => void;
  /** Renders "+ New", per-selection Edit/Delete, and the closed-term lock banner. False for read-only pickers. */
  allowManage?: boolean;
  /** PROPRIETOR only — shows Delete on the currently selected exam. Ignored when allowManage is false. */
  canDelete?: boolean;
  /** SCHOOL_ADMIN/PROPRIETOR — passed through to the lock banner's Unlock/Relock controls. */
  canManageTermLock?: boolean;
  id?: string;
  label?: string;
}

// v0.7 step 3 (SPEC_V0.7.md §3) — mirrors EvaluationPicker exactly (same
// closed-term visible-block discipline, same TermLockBanner reuse — it's
// already track-agnostic, zero changes needed there), retargeted to the
// exam-authoring endpoints.
export function ExamPicker({
  classArmId,
  subjectId,
  termId,
  value,
  onChange,
  allowManage = false,
  canDelete = false,
  canManageTermLock = false,
  id = "exam-select",
  label = "Exam",
}: ExamPickerProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const examsQuery = useExams({ classArmId, subjectId, termId });
  const deleteExam = useDeleteExam();
  const exams = examsQuery.data?.exams ?? [];
  const selected = exams.find((e) => e.id === value) ?? null;

  function openCreate() {
    setEditing(false);
    setFormOpen(true);
  }

  function openEdit() {
    setEditing(true);
    setFormOpen(true);
  }

  function handleDelete() {
    if (!selected) return;
    deleteExam.mutate(selected.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        onChange("");
      },
    });
  }

  const labelId = `${id}-label`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label id={labelId}>{label}</Label>
        {allowManage && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openCreate}
              disabled={examsQuery.data?.locked ?? false}
              title={examsQuery.data?.locked ? "This term is closed — ask your principal/proprietor to unlock before adding an exam." : undefined}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              New
            </Button>
            {selected && (
              <Button type="button" variant="outline" size="sm" aria-label={`Edit ${selected.name}`} onClick={openEdit}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
            {selected && canDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Delete ${selected.name}`}
                className="text-danger hover:bg-danger/10"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </div>

      {examsQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading exams…
        </div>
      )}
      {examsQuery.isError && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-danger">{getErrorMessage(examsQuery.error, "Couldn't load exams.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => examsQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {/* SPEC_V0.7.1.md §3 (item 6) — same list-not-dropdown treatment as
          EvaluationPicker. No description field on exams (schema comment:
          exams don't need a teacher-authored name/description), so each
          row is name-only. */}
      {!examsQuery.isLoading && !examsQuery.isError && (
        <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
          {exams.length === 0 ? (
            <p className="rounded-md border border-dashed border-muted/30 p-3 text-sm text-muted">No exams yet — create one.</p>
          ) : (
            exams.map((exam) => {
              const isSelected = exam.id === value;
              return (
                <button
                  key={exam.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onChange(exam.id)}
                  className={cn(
                    "flex flex-col items-start rounded-md border p-3 text-left transition-colors",
                    isSelected ? "border-primary bg-primary/5" : "border-muted/20 bg-card hover:border-muted/40",
                  )}
                >
                  <span className="text-sm font-medium text-text">{exam.name}</span>
                </button>
              );
            })
          )}
        </div>
      )}

      {allowManage && examsQuery.data && (
        <TermLockBanner
          termId={termId}
          classArmId={classArmId}
          subjectId={subjectId}
          termClosed={examsQuery.data.termClosed}
          locked={examsQuery.data.locked}
          unlockReason={examsQuery.data.unlockReason}
          canManage={canManageTermLock}
        />
      )}

      {allowManage && (
        <ExamFormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          classArmId={classArmId}
          subjectId={subjectId}
          termId={termId}
          exam={editing ? selected : null}
        />
      )}

      {allowManage && canDelete && (
        <ConfirmDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
          title="Delete exam"
          description={selected ? `Delete "${selected.name}"? Its scores will no longer count toward any student's exam average for this subject.` : undefined}
          confirmLabel="Delete"
          confirmTone="danger"
          isConfirming={deleteExam.isPending}
        >
          {deleteExam.isError && (
            <p role="alert" className="text-sm text-danger">
              {getErrorMessage(deleteExam.error)}
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
