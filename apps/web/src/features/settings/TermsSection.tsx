import { useState } from "react";
import { PlayCircle } from "lucide-react";
import type { AcademicSession, Term } from "@scholametric/shared";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDate } from "../../lib/format-date";
import { getErrorMessage } from "../../lib/api-client";
import { useTerms, useActivateTerm } from "./use-terms";
import { CreateTermDialog } from "./CreateTermDialog";

const TERM_LABELS: Record<string, string> = { FIRST: "First term", SECOND: "Second term", THIRD: "Third term" };

interface TermsSectionProps {
  session: AcademicSession | undefined;
}

export function TermsSection({ session }: TermsSectionProps) {
  const [page, setPage] = useState(1);
  const terms = useTerms(session?.id, page);
  const activateTerm = useActivateTerm();
  const [createOpen, setCreateOpen] = useState(false);
  const [activating, setActivating] = useState<Term | null>(null);

  function openActivate(event: React.MouseEvent, term: Term) {
    event.stopPropagation();
    setActivating(term);
  }

  const columns: DataTableColumn<Term>[] = [
    { key: "name", header: "Term", cell: (row) => TERM_LABELS[row.name] ?? row.name },
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

  if (!session) {
    return (
      <div className="rounded-lg border border-muted/20 bg-card p-6 text-center text-sm text-muted">
        Select a session above to manage its terms.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text">Terms for {session.name}</h2>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          New term
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={terms.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={terms.isLoading}
        isError={terms.isError}
        onRetry={() => terms.refetch()}
        emptyMessage="No terms yet for this session."
        page={page}
        pageSize={terms.data?.pageSize ?? 20}
        total={terms.data?.total ?? 0}
        onPageChange={setPage}
        renderMobileCard={(row) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <p className="font-medium text-text">{TERM_LABELS[row.name] ?? row.name}</p>
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

      <CreateTermDialog sessionId={session.id} open={createOpen} onClose={() => setCreateOpen(false)} />

      <ConfirmDialog
        open={activating !== null}
        onClose={() => setActivating(null)}
        onConfirm={() =>
          activating &&
          activateTerm.mutate(activating.id, {
            onSuccess: () => setActivating(null),
          })
        }
        title="Activate term"
        description={
          activating ? (
            <>
              This will make{" "}
              <span className="font-semibold text-text">{TERM_LABELS[activating.name] ?? activating.name}</span> the
              current term for {session.name}.
            </>
          ) : undefined
        }
        confirmLabel="Activate"
        isConfirming={activateTerm.isPending}
      />
      {activateTerm.isError && (
        <p role="alert" className="text-sm text-danger">
          {getErrorMessage(activateTerm.error)}
        </p>
      )}
    </div>
  );
}
