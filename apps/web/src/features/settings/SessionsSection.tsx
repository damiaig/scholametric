import { useState } from "react";
import { PlayCircle } from "lucide-react";
import type { AcademicSession } from "@scholametric/shared";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDate } from "../../lib/format-date";
import { getErrorMessage } from "../../lib/api-client";
import { useSessions, useActivateSession } from "./use-sessions";
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
        onClose={() => setActivating(null)}
        onConfirm={() =>
          activating &&
          activateSession.mutate(activating.id, {
            onSuccess: () => setActivating(null),
          })
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
        isConfirming={activateSession.isPending}
      />
      {activateSession.isError && (
        <p role="alert" className="text-sm text-danger">
          {getErrorMessage(activateSession.error)}
        </p>
      )}
    </div>
  );
}
