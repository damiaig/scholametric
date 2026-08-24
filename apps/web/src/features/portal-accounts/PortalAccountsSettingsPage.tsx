import { useState, type MouseEvent } from "react";
import { KeyRound } from "lucide-react";
import type { PortalAccountSummary } from "@scholametric/shared";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { usePortalAccounts, useProvisionPortalAccounts } from "./use-portal-accounts";
import { ReissuePortalAccountDialog } from "./ReissuePortalAccountDialog";

const PAGE_SIZE = 20;

// SPEC_V0.6.md §5 steps 1 + 5 — the first-ever admin UI for portal account
// provisioning (the endpoint existed since step 1 with no frontend) plus
// per-account reset & print (step 5). Class-arm batch printing lives at
// its own route, reached from ClassArmDetailPage — this section is the
// school-wide list + one-off reissue.
export function PortalAccountsSettingsPage() {
  const [page, setPage] = useState(1);
  const [resetting, setResetting] = useState<PortalAccountSummary | null>(null);
  const accountsQuery = usePortalAccounts({ page, pageSize: PAGE_SIZE });
  const provision = useProvisionPortalAccounts();

  function openReset(event: MouseEvent, account: PortalAccountSummary) {
    event.stopPropagation();
    setResetting(account);
  }

  const columns: DataTableColumn<PortalAccountSummary>[] = [
    { key: "displayName", header: "Name", cell: (row) => <span className="font-medium">{row.displayName}</span> },
    { key: "username", header: "Username", cell: (row) => <span className="font-mono text-xs">{row.username}</span> },
    { key: "role", header: "Role", cell: (row) => (row.role === "STUDENT" ? "Student" : "Parent/guardian") },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge
          label={row.mustChangePassword ? "Awaiting first login" : "Active"}
          tone={row.mustChangePassword ? "warning" : "success"}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <Button type="button" variant="outline" size="sm" aria-label={`Reset & print for ${row.displayName}`} onClick={(event) => openReset(event, row)}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6 rounded-lg border border-muted/20 bg-card p-4">
        <p className="mb-3 text-sm text-muted">
          Creates a student and parent/guardian portal login for every active student not yet provisioned, grouped
          into families by shared guardian.
        </p>
        {provision.isError && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {getErrorMessage(provision.error, "Couldn't provision accounts.")}
          </p>
        )}
        {provision.data && (
          <p className="mb-3 text-sm text-text">
            Created {provision.data.studentsCreated.length} student and {provision.data.parentsCreated.length}{" "}
            parent/guardian account(s).
            {provision.data.warnings.length > 0 && ` ${provision.data.warnings.length} warning(s) — see below.`}
          </p>
        )}
        {provision.data && provision.data.warnings.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1 text-sm text-warning">
            {provision.data.warnings.map((warning, index) => (
              <li key={index}>{warning.message}</li>
            ))}
          </ul>
        )}
        <Button type="button" size="sm" disabled={provision.isPending} onClick={() => provision.mutate()}>
          {provision.isPending && <Spinner className="mr-2" />}
          Provision portal accounts
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={accountsQuery.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={accountsQuery.isLoading}
        isError={accountsQuery.isError}
        errorMessage={getErrorMessage(accountsQuery.error, "Couldn't load portal accounts.")}
        onRetry={() => accountsQuery.refetch()}
        emptyMessage="No portal accounts yet. Provision them above."
        page={page}
        pageSize={PAGE_SIZE}
        total={accountsQuery.data?.total ?? 0}
        onPageChange={setPage}
        renderMobileCard={(row) => (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text">{row.displayName}</p>
              <p className="font-mono text-xs text-muted">{row.username}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge
                label={row.mustChangePassword ? "Awaiting first login" : "Active"}
                tone={row.mustChangePassword ? "warning" : "success"}
              />
              <Button type="button" variant="outline" size="sm" onClick={(event) => openReset(event, row)}>
                Reset &amp; print
              </Button>
            </div>
          </div>
        )}
      />

      {resetting && <ReissuePortalAccountDialog account={resetting} open={resetting !== null} onClose={() => setResetting(null)} />}
    </div>
  );
}
