import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PersonnelSummary } from "@scholametric/shared";
import { JOB_TITLE_LABELS } from "@scholametric/shared";
import { PageHeader } from "../../components/PageHeader";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { Input } from "../../components/ui/input";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { getErrorMessage } from "../../lib/api-client";
import { useTeachers } from "./use-teachers";
import { useClasses } from "./use-classes";
import { buildClassTeacherMap } from "./class-teacher-map";

const PAGE_SIZE = 20;

export function TeachersListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 300);
  const [page, setPage] = useState(1);

  const teachersQuery = useTeachers({ page, pageSize: PAGE_SIZE, search });
  const classesQuery = useClasses();
  const classTeacherMap = useMemo(() => buildClassTeacherMap(classesQuery.data), [classesQuery.data]);

  function classTeacherBadge(userId: string) {
    const labels = classTeacherMap.get(userId);
    if (!labels || labels.length === 0) return <span className="text-muted">—</span>;
    return <StatusBadge label={labels.join(", ")} tone="info" />;
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
    { key: "jobTitle", header: "Title", cell: (row) => JOB_TITLE_LABELS[row.jobTitle] ?? row.jobTitle },
    { key: "classTeacherOf", header: "Class teacher of", cell: (row) => classTeacherBadge(row.id) },
  ];

  return (
    <div>
      <PageHeader title="Teachers" />

      <div className="mb-4">
        <Input
          placeholder="Search by name or email…"
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
          aria-label="Search teachers"
        />
      </div>

      <DataTable
        columns={columns}
        rows={teachersQuery.data?.items ?? []}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/teachers/${row.id}`)}
        isLoading={teachersQuery.isLoading}
        isError={teachersQuery.isError}
        errorMessage={getErrorMessage(teachersQuery.error, "Couldn't load teachers.")}
        onRetry={() => teachersQuery.refetch()}
        emptyMessage="No teachers found. Try adjusting your search."
        page={page}
        pageSize={PAGE_SIZE}
        total={teachersQuery.data?.total ?? 0}
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
              {classTeacherBadge(row.id)}
            </div>
            <p className="text-xs text-muted">{JOB_TITLE_LABELS[row.jobTitle]}</p>
          </div>
        )}
      />
    </div>
  );
}
