import { useState } from "react";
import { Plus, Pencil, KeyRound } from "lucide-react";
import type { StaffRole, StaffUser } from "@scholametric/shared";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { getErrorMessage } from "../../lib/api-client";
import { useStaffUsers } from "./use-staff-users";
import { CreateUserDialog } from "./CreateUserDialog";
import { EditUserDialog } from "./EditUserDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";

const PAGE_SIZE = 20;
const ROLE_LABELS: Record<string, string> = { SCHOOL_ADMIN: "School admin", TEACHER: "Teacher" };

export function UsersSettingsPage() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 300);
  const [role, setRole] = useState<StaffRole | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [resetting, setResetting] = useState<StaffUser | null>(null);

  const usersQuery = useStaffUsers({ page, pageSize: PAGE_SIZE, search, role: role || undefined });

  function openEdit(event: React.MouseEvent, user: StaffUser) {
    event.stopPropagation();
    setEditing(user);
  }

  function openReset(event: React.MouseEvent, user: StaffUser) {
    event.stopPropagation();
    setResetting(user);
  }

  const columns: DataTableColumn<StaffUser>[] = [
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
    { key: "email", header: "Email", cell: (row) => row.email },
    { key: "role", header: "Role", cell: (row) => ROLE_LABELS[row.role] ?? row.role },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge label={row.status === "ACTIVE" ? "Active" : "Disabled"} tone={row.status === "ACTIVE" ? "success" : "neutral"} />
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
              setRole(event.target.value as StaffRole | "");
              setPage(1);
            }}
            aria-label="Filter by role"
            className="sm:max-w-[180px]"
          >
            <option value="">All roles</option>
            <option value="SCHOOL_ADMIN">School admin</option>
            <option value="TEACHER">Teacher</option>
          </Select>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New user
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={usersQuery.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={usersQuery.isLoading}
        isError={usersQuery.isError}
        errorMessage={getErrorMessage(usersQuery.error, "Couldn't load staff.")}
        onRetry={() => usersQuery.refetch()}
        emptyMessage="No staff found. Try adjusting your search or filters."
        page={page}
        pageSize={PAGE_SIZE}
        total={usersQuery.data?.total ?? 0}
        onPageChange={setPage}
        renderMobileCard={(row) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text">
                  {row.firstName} {row.lastName}
                </p>
                <p className="text-xs text-muted">{row.email}</p>
              </div>
              <StatusBadge label={row.status === "ACTIVE" ? "Active" : "Disabled"} tone={row.status === "ACTIVE" ? "success" : "neutral"} />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">{ROLE_LABELS[row.role] ?? row.role}</p>
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

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editing && <EditUserDialog user={editing} open={editing !== null} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordDialog user={resetting} open={resetting !== null} onClose={() => setResetting(null)} />}
    </div>
  );
}
