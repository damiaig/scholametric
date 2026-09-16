import { useState } from "react";
import { CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";
import type { Break } from "@scholametric/shared";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { useBreaks, useDeleteBreak } from "./use-breaks";
import { BreakFormDialog } from "./BreakFormDialog";

// v0.8 step 1 (SPEC_V0.8.md §7 item 1) — global across the day: editing a
// break here applies school-wide, not per-class. See PeriodsSection's
// comment for why this is a plain list, not DataTable.
export function BreaksSection() {
  const breaks = useBreaks();
  const deleteBreak = useDeleteBreak();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Break | null>(null);
  const [deleting, setDeleting] = useState<Break | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(brk: Break) {
    setEditing(brk);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text">Breaks</h2>
          <p className="text-sm text-muted">Global across the day — a change here applies to every class.</p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New break
        </Button>
      </div>

      {breaks.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading breaks…
        </p>
      )}

      {breaks.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <CircleAlert className="h-8 w-8 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{getErrorMessage(breaks.error, "Couldn't load breaks.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => breaks.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {breaks.data && breaks.data.length === 0 && (
        <div className="rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-muted">No breaks yet. Add the school's first break (e.g. Lunch) to get started.</p>
        </div>
      )}

      {breaks.data && breaks.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-muted/20 bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-muted/20">
                <th className="px-4 py-3 font-medium text-muted">Name</th>
                <th className="px-4 py-3 font-medium text-muted">Starts</th>
                <th className="px-4 py-3 font-medium text-muted">Ends</th>
                <th className="px-4 py-3 font-medium text-muted"></th>
              </tr>
            </thead>
            <tbody>
              {breaks.data.map((brk) => (
                <tr key={brk.id} className="border-b border-muted/10 last:border-0">
                  <td className="px-4 py-3 text-text">{brk.name}</td>
                  <td className="px-4 py-3 font-mono text-text">{brk.startsAt}</td>
                  <td className="px-4 py-3 font-mono text-text">{brk.endsAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" aria-label={`Edit ${brk.name}`} onClick={() => openEdit(brk)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Delete ${brk.name}`}
                        className="text-danger hover:bg-danger/10"
                        onClick={() => setDeleting(brk)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BreakFormDialog open={formOpen} onClose={() => setFormOpen(false)} brk={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          deleteBreak.reset();
        }}
        onConfirm={() => deleting && deleteBreak.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        title="Delete break"
        description={deleting ? <>This removes <span className="font-semibold text-text">{deleting.name}</span> from the school day.</> : undefined}
        confirmLabel="Delete"
        confirmTone="danger"
        isConfirming={deleteBreak.isPending}
      >
        {deleteBreak.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(deleteBreak.error)}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
