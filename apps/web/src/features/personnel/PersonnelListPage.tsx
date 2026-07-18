import { useState, type MouseEvent } from "react";
import { Plus, Pencil, KeyRound } from "lucide-react";
import {
  JOB_TITLES,
  JOB_TITLE_LABELS,
  PERSONNEL_ROLES,
  PERSONNEL_ROLE_LABELS,
  type JobTitleValue,
  type PersonnelRole,
  type PersonnelSummary,
} from "@scholametric/shared";
import { PageHeader } from "../../components/PageHeader";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { getErrorMessage } from "../../lib/api-client";
import { usePersonnel } from "./use-personnel";
import { CreatePersonnelDialog } from "./CreatePersonnelDialog";
import { EditPersonnelDialog } from "./EditPersonnelDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";

const PAGE_SIZE = 20;

export function PersonnelListPage() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 300);
  const [role, setRole] = useState<PersonnelRole | "">("");
  const [jobTitle, setJobTitle] = useState<JobTitleValue | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PersonnelSummary | null>(null);
  const [resetting, setResetting] = useState<PersonnelSummary | null>(null);

  const personnelQuery = usePersonnel({
    page,
    pageSize: PAGE_SIZE,
    search,
    role: role || undefined,
    jobTitle: jobTitle || undefined,
  });

  function openEdit(event: MouseEvent, person: PersonnelSummary) {
    event.stopPropagation();
    setEditing(person);
  }

  function openReset(event: MouseEvent, person: PersonnelSummary) {
    event.stopPropagation();
    setResetting(person);
  }

  const columns: DataTableColumn<PersonnelSummary>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      sortValue: (row) => `${row.lastName} ${row.firstName}`.toLowerCase(),
      cell: (row) => (
        <span className="font-medium">
          {row.firstName} {row.lastName}
        </span>
      ),
    },
    {
      key: "staffNumber",
      header: "Staff no.",
      cell: (row) => <span className="font-mono text-xs">{row.staffNumber}</span>,
    },
    { key: "role", header: "Role", cell: (row) => PERSONNEL_ROLE_LABELS[row.role] ?? row.role },
    { key: "jobTitle", header: "Title", cell: (row) => JOB_TITLE_LABELS[row.jobTitle] ?? row.jobTitle },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge
          label={row.status === "ACTIVE" ? "Active" : "Disabled"}
          tone={row.status === "ACTIVE" ? "success" : "neutral"}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit ${row.firstName} ${row.lastName}`}
            onClick={(event) => openEdit(event, row)}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Reset password for ${row.firstName} ${row.lastName}`}
            onClick={(event) => openReset(event, row)}
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Personnel"
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New staff member
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search by name or email…"
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
          aria-label="Search staff"
        />
        <Select
          value={role}
          onChange={(event) => {
            setRole(event.target.value as PersonnelRole | "");
            setPage(1);
          }}
          aria-label="Filter by role"
          className="sm:max-w-[180px]"
        >
          <option value="">All roles</option>
          {PERSONNEL_ROLES.map((value) => (
            <option key={value} value={value}>
              {PERSONNEL_ROLE_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select
          value={jobTitle}
          onChange={(event) => {
            setJobTitle(event.target.value as JobTitleValue | "");
            setPage(1);
          }}
          aria-label="Filter by title"
          className="sm:max-w-[200px]"
        >
          <option value="">All titles</option>
          {JOB_TITLES.map((value) => (
            <option key={value} value={value}>
              {JOB_TITLE_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={personnelQuery.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={personnelQuery.isLoading}
        isError={personnelQuery.isError}
        errorMessage={getErrorMessage(personnelQuery.error, "Couldn't load staff.")}
        onRetry={() => personnelQuery.refetch()}
        emptyMessage="No staff found. Try adjusting your search or filters."
        page={page}
        pageSize={PAGE_SIZE}
        total={personnelQuery.data?.total ?? 0}
        onPageChange={setPage}
        renderMobileCard={(row) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text">
                  {row.firstName} {row.lastName}
                </p>
                <p className="font-mono text-xs text-muted">{row.staffNumber}</p>
              </div>
              <StatusBadge
                label={row.status === "ACTIVE" ? "Active" : "Disabled"}
                tone={row.status === "ACTIVE" ? "success" : "neutral"}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">
                {PERSONNEL_ROLE_LABELS[row.role]} · {JOB_TITLE_LABELS[row.jobTitle]}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={(event) => openEdit(event, row)}>
                  Edit
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={(event) => openReset(event, row)}>
                  Reset password
                </Button>
              </div>
            </div>
          </div>
        )}
      />

      <CreatePersonnelDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editing && <EditPersonnelDialog person={editing} open={editing !== null} onClose={() => setEditing(null)} />}
      {resetting && (
        <ResetPasswordDialog person={resetting} open={resetting !== null} onClose={() => setResetting(null)} />
      )}
    </div>
  );
}
