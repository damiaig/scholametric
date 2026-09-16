import { useEffect, useState } from "react";
import { CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";
import type { Holiday } from "@scholametric/shared";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { Label } from "../../components/ui/label";
import { Spinner } from "../../components/ui/spinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { formatDate } from "../../lib/format-date";
import { getErrorMessage } from "../../lib/api-client";
import { useSessions } from "./use-sessions";
import { useHolidays, useDeleteHoliday } from "./use-holidays";
import { HolidayFormDialog } from "./HolidayFormDialog";

// v0.8 step 1 (SPEC_V0.8.md §7 item 1) — self-contained session picker
// (not the AcademicSettingsPage's shared selectedSession state): this
// section only ever READS which session to scope holidays to, it doesn't
// manage sessions themselves.
export function HolidaysSection() {
  const sessions = useSessions(1, 100);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const holidays = useHolidays(sessionId);
  const deleteHoliday = useDeleteHoliday();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [deleting, setDeleting] = useState<Holiday | null>(null);

  useEffect(() => {
    if (!sessionId && sessions.data?.items.length) {
      const current = sessions.data.items.find((s) => s.isCurrent);
      setSessionId((current ?? sessions.data.items[0]).id);
    }
  }, [sessionId, sessions.data]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(holiday: Holiday) {
    setEditing(holiday);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text">Holidays</h2>
          <p className="text-sm text-muted">No-school days and ranges for a session.</p>
        </div>
        <Button type="button" size="sm" onClick={openCreate} disabled={!sessionId}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New holiday
        </Button>
      </div>

      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="holiday-session">Session</Label>
        <Select id="holiday-session" value={sessionId ?? ""} onChange={(e) => setSessionId(e.target.value)} disabled={!sessions.data?.items.length}>
          {(sessions.data?.items ?? []).map((session) => (
            <option key={session.id} value={session.id}>
              {session.name}
            </option>
          ))}
        </Select>
      </div>

      {holidays.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading holidays…
        </p>
      )}

      {holidays.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <CircleAlert className="h-8 w-8 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{getErrorMessage(holidays.error, "Couldn't load holidays.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => holidays.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {holidays.data && holidays.data.length === 0 && (
        <div className="rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-muted">No holidays yet for this session.</p>
        </div>
      )}

      {holidays.data && holidays.data.length > 0 && (
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
              {holidays.data.map((holiday) => (
                <tr key={holiday.id} className="border-b border-muted/10 last:border-0">
                  <td className="px-4 py-3 text-text">{holiday.name}</td>
                  <td className="px-4 py-3 text-text">{formatDate(holiday.startDate)}</td>
                  <td className="px-4 py-3 text-text">{formatDate(holiday.endDate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" aria-label={`Edit ${holiday.name}`} onClick={() => openEdit(holiday)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Delete ${holiday.name}`}
                        className="text-danger hover:bg-danger/10"
                        onClick={() => setDeleting(holiday)}
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

      {sessionId && <HolidayFormDialog open={formOpen} onClose={() => setFormOpen(false)} holiday={editing} sessionId={sessionId} />}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          deleteHoliday.reset();
        }}
        onConfirm={() => deleting && sessionId && deleteHoliday.mutate({ id: deleting.id, sessionId }, { onSuccess: () => setDeleting(null) })}
        title="Delete holiday"
        description={deleting ? <>This removes <span className="font-semibold text-text">{deleting.name}</span>.</> : undefined}
        confirmLabel="Delete"
        confirmTone="danger"
        isConfirming={deleteHoliday.isPending}
      >
        {deleteHoliday.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(deleteHoliday.error)}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
