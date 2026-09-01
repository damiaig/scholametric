import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { useDeleteEvaluation, useEvaluations } from "./use-evaluations";
import { EvaluationFormDialog } from "./EvaluationFormDialog";
import { TermLockBanner } from "./TermLockBanner";

interface EvaluationPickerProps {
  classArmId: string;
  subjectId: string;
  termId: string;
  value: string;
  onChange: (evaluationId: string) => void;
  /** Renders "+ New", per-selection Edit/Delete, and the closed-term lock banner. False for read-only pickers (e.g. MarkAbsentDialog). */
  allowManage?: boolean;
  /** PROPRIETOR only — shows Delete on the currently selected evaluation. Ignored when allowManage is false. */
  canDelete?: boolean;
  /** SCHOOL_ADMIN/PROPRIETOR — passed through to the lock banner's Unlock/Relock controls. */
  canManageTermLock?: boolean;
  id?: string;
  label?: string;
}

// v0.7 step 2 (SPEC_V0.7.md §3) — shared between ScoreEntryGridPage (full
// authoring: create/edit/delete) and MarkAbsentDialog (allowManage=false,
// browse-only: picking which evaluation's score to correct). The closed-
// term lock renders VISIBLY here (disabled "+ New" + TermLockBanner's
// reason banner) BEFORE the teacher ever opens the create form — reading
// the SAME termClosed/locked/unlockReason contract the score-entry grid
// itself already relies on, not a reactive 409 after submit (the v0.6
// lesson SPEC_V0.7.md's plan explicitly called out).
export function EvaluationPicker({
  classArmId,
  subjectId,
  termId,
  value,
  onChange,
  allowManage = false,
  canDelete = false,
  canManageTermLock = false,
  id = "evaluation-select",
  label = "Evaluation",
}: EvaluationPickerProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const evaluationsQuery = useEvaluations({ classArmId, subjectId, termId });
  const deleteEvaluation = useDeleteEvaluation();
  const evaluations = evaluationsQuery.data?.evaluations ?? [];
  const selected = evaluations.find((e) => e.id === value) ?? null;

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
    deleteEvaluation.mutate(selected.id, {
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
              disabled={evaluationsQuery.data?.locked ?? false}
              title={evaluationsQuery.data?.locked ? "This term is closed — ask your principal/proprietor to unlock before adding an evaluation." : undefined}
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

      {evaluationsQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading evaluations…
        </div>
      )}
      {evaluationsQuery.isError && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-danger">{getErrorMessage(evaluationsQuery.error, "Couldn't load evaluations.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => evaluationsQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {/* SPEC_V0.7.1.md §3 (item 6) — the evaluation LIST shown up front,
          replacing the empty dropdown a teacher had to decode. Each row is
          independently clickable (name + description); the empty state
          names the exact next action instead of a bare placeholder. */}
      {!evaluationsQuery.isLoading && !evaluationsQuery.isError && (
        <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
          {evaluations.length === 0 ? (
            <p className="rounded-md border border-dashed border-muted/30 p-3 text-sm text-muted">
              No evaluations yet — create one.
            </p>
          ) : (
            evaluations.map((evaluation) => {
              const isSelected = evaluation.id === value;
              return (
                <button
                  key={evaluation.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onChange(evaluation.id)}
                  className={cn(
                    "flex flex-col items-start rounded-md border p-3 text-left transition-colors",
                    isSelected ? "border-primary bg-primary/5" : "border-muted/20 bg-card hover:border-muted/40",
                  )}
                >
                  <span className="text-sm font-medium text-text">{evaluation.name}</span>
                  {evaluation.description && <span className="text-xs text-muted">{evaluation.description}</span>}
                </button>
              );
            })
          )}
        </div>
      )}

      {allowManage && evaluationsQuery.data && (
        <TermLockBanner
          termId={termId}
          classArmId={classArmId}
          subjectId={subjectId}
          termClosed={evaluationsQuery.data.termClosed}
          locked={evaluationsQuery.data.locked}
          unlockReason={evaluationsQuery.data.unlockReason}
          canManage={canManageTermLock}
        />
      )}

      {allowManage && (
        <EvaluationFormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          classArmId={classArmId}
          subjectId={subjectId}
          termId={termId}
          evaluation={editing ? selected : null}
        />
      )}

      {allowManage && canDelete && (
        <ConfirmDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
          title="Delete evaluation"
          description={selected ? `Delete "${selected.name}"? Its scores will no longer count toward any student's total for this subject.` : undefined}
          confirmLabel="Delete"
          confirmTone="danger"
          isConfirming={deleteEvaluation.isPending}
        >
          {deleteEvaluation.isError && (
            <p role="alert" className="text-sm text-danger">
              {getErrorMessage(deleteEvaluation.error)}
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
