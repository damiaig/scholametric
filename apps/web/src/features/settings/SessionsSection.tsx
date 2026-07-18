import { useState } from "react";
import { PlayCircle, TriangleAlert } from "lucide-react";
import type { AcademicSession } from "@scholametric/shared";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Spinner } from "../../components/ui/spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDate } from "../../lib/format-date";
import { getErrorMessage } from "../../lib/api-client";
import { useSessions, useActivateSession, useActivationPreview } from "./use-sessions";
import { CreateSessionDialog } from "./CreateSessionDialog";

interface SessionsSectionProps {
  onSelectSession: (session: AcademicSession) => void;
}

export function SessionsSection({ onSelectSession }: SessionsSectionProps) {
  const [page, setPage] = useState(1);
  const sessions = useSessions(page);
  const activateSession = useActivateSession();
  const [createOpen, setCreateOpen] = useState(false);
  const [activating, setActivating] = useState<AcademicSession | null>(null);
  const preview = useActivationPreview(activating?.id ?? null);

  function openActivate(event: React.MouseEvent, session: AcademicSession) {
    event.stopPropagation();
    setActivating(session);
  }

  const columns: DataTableColumn<AcademicSession>[] = [
    { key: "name", header: "Session", cell: (row) => row.name },
    { key: "startsOn", header: "Starts", cell: (row) => formatDate(row.startsOn) },
    { key: "endsOn", header: "Ends", cell: (row) => formatDate(row.endsOn) },
    {
      key: "status",
      header: "Status",
      cell: (row) => (row.isCurrent ? <StatusBadge label="Current" tone="success" /> : null),
    },
    {
      key: "actions",
      header: "",
      cell: (row) =>
        !row.isCurrent ? (
          <Button type="button" variant="outline" size="sm" onClick={(event) => openActivate(event, row)}>
            <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Activate
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text">Sessions</h2>
          <p className="text-sm text-muted">Click a session to manage its terms below.</p>
        </div>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          New session
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={sessions.data?.items ?? []}
        rowKey={(row) => row.id}
        onRowClick={onSelectSession}
        isLoading={sessions.isLoading}
        isError={sessions.isError}
        onRetry={() => sessions.refetch()}
        emptyMessage="No sessions yet. Create the school's first academic session to get started."
        page={page}
        pageSize={sessions.data?.pageSize ?? 20}
        total={sessions.data?.total ?? 0}
        onPageChange={setPage}
        renderMobileCard={(row) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <p className="font-medium text-text">{row.name}</p>
              {row.isCurrent && <StatusBadge label="Current" tone="success" />}
            </div>
            <p className="text-sm text-muted">
              {formatDate(row.startsOn)} – {formatDate(row.endsOn)}
            </p>
            {!row.isCurrent && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 self-start"
                onClick={(event) => openActivate(event, row)}
              >
                Activate
              </Button>
            )}
          </div>
        )}
      />

      <CreateSessionDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <ConfirmDialog
        open={activating !== null}
        onClose={() => {
          setActivating(null);
          activateSession.reset();
        }}
        onConfirm={(confirmName) =>
          activating &&
          confirmName &&
          activateSession.mutate(
            { id: activating.id, confirmName },
            { onSuccess: () => setActivating(null) },
          )
        }
        title="Activate session"
        description={
          activating ? (
            <>
              This will make <span className="font-semibold text-text">{activating.name}</span> the current
              session for the whole school.
            </>
          ) : undefined
        }
        confirmLabel="Activate"
        confirmTone="danger"
        isConfirming={activateSession.isPending}
        requireTypedConfirmation={activating?.name}
        confirmDisabled={preview.isLoading || preview.isError}
      >
        {preview.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Loading enrollment counts…
          </p>
        )}
        {preview.isError && <p className="text-sm text-danger">Couldn&apos;t load activation details.</p>}
        {preview.data && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-muted/20 p-3">
                <p className="text-muted">Current session</p>
                <p className="font-medium text-text">{preview.data.currentSession?.name ?? "—"}</p>
                <p className="text-muted">
                  {preview.data.currentSession?.enrollmentCount ?? 0} enrolled students
                </p>
              </div>
              <div className="rounded-md border border-muted/20 p-3">
                <p className="text-muted">Target session</p>
                <p className="font-medium text-text">{preview.data.targetSession.name}</p>
                <p className="text-muted">{preview.data.targetSession.enrollmentCount} enrolled students</p>
              </div>
            </div>
            {preview.data.targetSession.enrollmentCount === 0 && (
              <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-text">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                {preview.data.targetSession.name} has no enrolled students — students will not appear in lists
                until enrolled.
              </p>
            )}
            {preview.data.currentSession &&
              preview.data.targetSession.enrollmentCount < preview.data.currentSession.enrollmentCount && (
                <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-text">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  {preview.data.targetSession.name} has fewer enrolled students than {preview.data.currentSession.name}.
                </p>
              )}
          </div>
        )}
        {activateSession.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(activateSession.error)}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
