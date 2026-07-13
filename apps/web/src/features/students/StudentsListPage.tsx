import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Student, StudentStatus } from "@scholametric/shared";
import { PageHeader } from "../../components/PageHeader";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { Avatar } from "../../components/Avatar";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { getErrorMessage } from "../../lib/api-client";
import { useStudents } from "./use-students";
import { useClassArms } from "./use-class-arms";
import { useClassLevels } from "./use-class-levels";
import { buildClassArmOptions } from "./class-arm-options";
import { studentStatusTone, studentStatusLabel, STUDENT_STATUS_FILTER_OPTIONS } from "./student-status";
import { useCanManageStudents } from "./use-can-manage-students";

const PAGE_SIZE = 20;

function classLabel(row: Student): string {
  return row.currentEnrollment
    ? `${row.currentEnrollment.classArm.classLevel.name} ${row.currentEnrollment.classArm.name}`
    : "—";
}

export function StudentsListPage() {
  const navigate = useNavigate();
  const canManage = useCanManageStudents();

  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 300);
  const [classArmId, setClassArmId] = useState("");
  const [status, setStatus] = useState<StudentStatus | "">("");
  const [page, setPage] = useState(1);

  const studentsQuery = useStudents({
    page,
    pageSize: PAGE_SIZE,
    search,
    classArmId: classArmId || undefined,
    status: status || undefined,
  });

  // isError (not just "no data") — a TEACHER's GET /class-arms 403s, and we
  // want the filter absent, not a broken/empty dropdown. See use-class-arms.ts.
  const classLevelsQuery = useClassLevels();
  const classArmsQuery = useClassArms();
  const classArmOptions =
    classLevelsQuery.data && classArmsQuery.data
      ? buildClassArmOptions(classLevelsQuery.data, classArmsQuery.data)
      : [];

  const columns: DataTableColumn<Student>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      sortValue: (row) => `${row.lastName} ${row.firstName}`.toLowerCase(),
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar firstName={row.firstName} lastName={row.lastName} />
          <span className="font-medium">
            {row.firstName} {row.lastName}
          </span>
        </div>
      ),
    },
    {
      key: "admissionNumber",
      header: "Admission No.",
      className: "font-mono",
      sortable: true,
      sortValue: (row) => row.admissionNumber,
      cell: (row) => row.admissionNumber,
    },
    { key: "class", header: "Class", cell: classLabel },
    { key: "gender", header: "Gender", cell: (row) => (row.gender === "MALE" ? "Male" : "Female") },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge label={studentStatusLabel(row.status)} tone={studentStatusTone(row.status)} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Students"
        description={studentsQuery.data ? `${studentsQuery.data.total} students` : undefined}
        actions={
          canManage ? (
            <Button type="button" onClick={() => navigate("/students/new")}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New student
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search by name or admission number…"
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
          aria-label="Search students"
        />
        {classArmOptions.length > 0 && (
          <Select
            value={classArmId}
            onChange={(event) => {
              setClassArmId(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by class"
            className="sm:max-w-[180px]"
          >
            <option value="">All classes</option>
            {classArmOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as StudentStatus | "");
            setPage(1);
          }}
          aria-label="Filter by status"
          className="sm:max-w-[180px]"
        >
          {STUDENT_STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={studentsQuery.data?.items ?? []}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/students/${row.id}`)}
        isLoading={studentsQuery.isLoading}
        isError={studentsQuery.isError}
        errorMessage={getErrorMessage(studentsQuery.error, "Couldn't load students.")}
        onRetry={() => studentsQuery.refetch()}
        emptyMessage="No students found. Try adjusting your search or filters."
        page={page}
        pageSize={PAGE_SIZE}
        total={studentsQuery.data?.total ?? 0}
        onPageChange={setPage}
        renderMobileCard={(row) => (
          <div className="flex items-center gap-3">
            <Avatar firstName={row.firstName} lastName={row.lastName} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-text">
                {row.firstName} {row.lastName}
              </p>
              <p className="font-mono text-xs text-muted">{row.admissionNumber}</p>
              <p className="text-xs text-muted">{classLabel(row)}</p>
            </div>
            <StatusBadge label={studentStatusLabel(row.status)} tone={studentStatusTone(row.status)} />
          </div>
        )}
      />
    </div>
  );
}
