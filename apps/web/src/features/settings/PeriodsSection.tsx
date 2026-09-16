import { useState } from "react";
import { CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";
import type { Period } from "@scholametric/shared";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { usePeriods, useDeletePeriod } from "./use-periods";
import { PeriodFormDialog } from "./PeriodFormDialog";

// v0.8 step 1 (SPEC_V0.8.md §7 item 1) — the bell schedule. A plain list,
// not DataTable: periods/breaks/holidays/class-school-days are all small,
// unpaginated config lists (the backend returns a whole array, not a
// Paginated<T> page) — DataTable's pagination contract doesn't fit, so
// this reuses its visual language (card/border/table classes) without
// forcing fake page/total props onto a dataset that will never paginate.
export function PeriodsSection() {
  const periods = usePeriods();
  const deletePeriod = useDeletePeriod();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Period | null>(null);
  const [deleting, setDeleting] = useState<Period | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(period: Period) {
    setEditing(period);
    setFormOpen(true);
  }

  const nextSortOrder = (periods.data?.length ?? 0) === 0 ? 0 : Math.max(...(periods.data ?? []).map((p) => p.sortOrder)) + 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text">Periods</h2>
          <p className="text-sm text-muted">The school's bell schedule — variable-length teaching periods.</p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New period
        </Button>
      </div>

      {periods.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading periods…
        </p>
      )}

      {periods.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <CircleAlert className="h-8 w-8 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{getErrorMessage(periods.error, "Couldn't load periods.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => periods.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {periods.data && periods.data.length === 0 && (
        <div className="rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-muted">No periods yet. Add the school's first period to get started.</p>
        </div>
      )}

      {periods.data && periods.data.length > 0 && (
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
              {periods.data.map((period) => (
                <tr key={period.id} className="border-b border-muted/10 last:border-0">
                  <td className="px-4 py-3 text-text">{period.name}</td>
                  <td className="px-4 py-3 font-mono text-text">{period.startsAt}</td>
                  <td className="px-4 py-3 font-mono text-text">{period.endsAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" aria-label={`Edit ${period.name}`} onClick={() => openEdit(period)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Delete ${period.name}`}
                        className="text-danger hover:bg-danger/10"
                        onClick={() => setDeleting(period)}
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

      <PeriodFormDialog open={formOpen} onClose={() => setFormOpen(false)} period={editing} nextSortOrder={nextSortOrder} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          deletePeriod.reset();
        }}
        onConfirm={() => deleting && deletePeriod.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        title="Delete period"
        description={deleting ? <>This removes <span className="font-semibold text-text">{deleting.name}</span> from the bell schedule.</> : undefined}
        confirmLabel="Delete"
        confirmTone="danger"
        isConfirming={deletePeriod.isPending}
      >
        {deletePeriod.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(deletePeriod.error)}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
