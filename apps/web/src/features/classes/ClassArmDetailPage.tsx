import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Plus, Trash2, Users } from "lucide-react";
import type { ClassArmStudentRow } from "@scholametric/shared";
import { PageHeader } from "../../components/PageHeader";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { isSchoolAdmin } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { studentStatusTone, studentStatusLabel } from "../students/student-status";
import { useClassArmDetail } from "./use-class-arm-detail";
import { useRemoveClassTeacher } from "./use-class-teacher";
import { useRemoveSubjectAssignment } from "./use-subject-assignments";
import { AssignClassTeacherForArmDialog } from "./AssignClassTeacherForArmDialog";
import { AddSubjectTeacherDialog } from "./AddSubjectTeacherDialog";

const STUDENTS_PAGE_SIZE = 20;

export function ClassArmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const canManage = isSchoolAdmin(currentUser?.role);

  const [studentsPage, setStudentsPage] = useState(1);
  const armQuery = useClassArmDetail(id, studentsPage, STUDENTS_PAGE_SIZE);
  const removeClassTeacher = useRemoveClassTeacher();
  const removeSubjectAssignment = useRemoveSubjectAssignment();

  const [assignTeacherOpen, setAssignTeacherOpen] = useState(false);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [removingClassTeacher, setRemovingClassTeacher] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);

  if (armQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading class…
      </div>
    );
  }

  if (armQuery.isError || !armQuery.data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
        <p className="text-sm text-danger">{getErrorMessage(armQuery.error, "Couldn't load this class.")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => armQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const arm = armQuery.data;
  const armLabel = `${arm.classLevel.name} ${arm.name}`;

  const studentColumns: DataTableColumn<ClassArmStudentRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar firstName={row.firstName} lastName={row.lastName} />
          <span className="font-medium">
            {row.firstName} {row.lastName}
          </span>
        </div>
      ),
    },
    { key: "admissionNumber", header: "Admission No.", className: "font-mono", cell: (row) => row.admissionNumber },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge label={studentStatusLabel(row.status)} tone={studentStatusTone(row.status)} />,
    },
  ];

  return (
    <div>
      <Button type="button" variant="outline" size="sm" className="mb-4" onClick={() => navigate("/classes")}>
        Back to classes
      </Button>

      <PageHeader
        title={armLabel}
        description={`${arm.students.total} student${arm.students.total === 1 ? "" : "s"} enrolled this session`}
      />

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-text">Class teacher</h2>
        <div className="flex items-center justify-between rounded-lg border border-muted/20 bg-card p-4">
          {arm.classTeacher ? (
            <div className="flex items-center gap-3">
              <Avatar firstName={arm.classTeacher.firstName} lastName={arm.classTeacher.lastName} />
              <Link to={`/teachers/${arm.classTeacher.userId}`} className="text-sm font-medium text-primary hover:underline">
                {arm.classTeacher.firstName} {arm.classTeacher.lastName}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted">No class teacher assigned.</p>
          )}
          {canManage && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAssignTeacherOpen(true)}>
                {arm.classTeacher ? "Change" : "Assign"}
              </Button>
              {arm.classTeacher && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-danger hover:bg-danger/10"
                  onClick={() => setRemovingClassTeacher(true)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Subject teachers</h2>
          {canManage && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAddSubjectOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add subject teacher
            </Button>
          )}
        </div>
        {arm.subjectTeachers.length === 0 ? (
          <p className="text-sm text-muted">No subject teachers assigned this session.</p>
        ) : (
          <>
            {/* Mobile: cards (CLAUDE.md §6 — tables collapse to cards below sm).
                The plain <table> below wraps "Subject"/"Teacher" cell text at
                360px otherwise (e.g. "English Language" breaking mid-word). */}
            <div className="flex flex-col gap-2 sm:hidden">
              {arm.subjectTeachers.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-muted/20 bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="text-text">{entry.subjectName}</p>
                    <Link to={`/teachers/${entry.teacherUserId}`} className="text-sm text-primary hover:underline">
                      {entry.teacherFirstName} {entry.teacherLastName}
                    </Link>
                  </div>
                  {canManage && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Remove ${entry.subjectName} for ${entry.teacherFirstName} ${entry.teacherLastName}`}
                      className="shrink-0 text-danger hover:bg-danger/10"
                      onClick={() => setRemovingAssignmentId(entry.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-muted/20 bg-card sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-muted/20">
                    <th className="px-4 py-3 font-medium text-muted">Subject</th>
                    <th className="px-4 py-3 font-medium text-muted">Teacher</th>
                    {canManage && <th className="px-4 py-3 font-medium text-muted" />}
                  </tr>
                </thead>
                <tbody>
                  {arm.subjectTeachers.map((entry) => (
                    <tr key={entry.id} className="border-b border-muted/10 last:border-0">
                      <td className="px-4 py-3 text-text">{entry.subjectName}</td>
                      <td className="px-4 py-3">
                        <Link to={`/teachers/${entry.teacherUserId}`} className="text-primary hover:underline">
                          {entry.teacherFirstName} {entry.teacherLastName}
                        </Link>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Remove ${entry.subjectName} for ${entry.teacherFirstName} ${entry.teacherLastName}`}
                            className="text-danger hover:bg-danger/10"
                            onClick={() => setRemovingAssignmentId(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-text">
          <Users className="h-4 w-4" aria-hidden="true" /> Students
        </h2>
        <DataTable
          columns={studentColumns}
          rows={arm.students.items}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/students/${row.id}`)}
          isLoading={false}
          isError={false}
          emptyMessage="No students enrolled in this class this session."
          page={arm.students.page}
          pageSize={arm.students.pageSize}
          total={arm.students.total}
          onPageChange={setStudentsPage}
          renderMobileCard={(row) => (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar firstName={row.firstName} lastName={row.lastName} />
                <div>
                  <p className="font-medium text-text">
                    {row.firstName} {row.lastName}
                  </p>
                  <p className="font-mono text-xs text-muted">{row.admissionNumber}</p>
                </div>
              </div>
              <StatusBadge label={studentStatusLabel(row.status)} tone={studentStatusTone(row.status)} />
            </div>
          )}
        />
      </section>

      {canManage && (
        <>
          <AssignClassTeacherForArmDialog
            armId={arm.id}
            armLabel={armLabel}
            currentTeacherUserId={arm.classTeacher?.userId ?? null}
            open={assignTeacherOpen}
            onClose={() => setAssignTeacherOpen(false)}
          />
          <AddSubjectTeacherDialog armId={arm.id} open={addSubjectOpen} onClose={() => setAddSubjectOpen(false)} />

          <ConfirmDialog
            open={removingClassTeacher}
            onClose={() => setRemovingClassTeacher(false)}
            onConfirm={() => {
              removeClassTeacher.mutate(arm.id, { onSuccess: () => setRemovingClassTeacher(false) });
            }}
            title="Remove class teacher"
            description={`This unassigns the class teacher for ${armLabel}. It can be reassigned at any time.`}
            confirmLabel="Remove"
            confirmTone="danger"
            isConfirming={removeClassTeacher.isPending}
          />

          <ConfirmDialog
            open={removingAssignmentId !== null}
            onClose={() => setRemovingAssignmentId(null)}
            onConfirm={() => {
              if (!removingAssignmentId) return;
              removeSubjectAssignment.mutate(removingAssignmentId, {
                onSuccess: () => setRemovingAssignmentId(null),
              });
            }}
            title="Remove subject teacher"
            description="This removes the subject teacher assignment for this class and session."
            confirmLabel="Remove"
            confirmTone="danger"
            isConfirming={removeSubjectAssignment.isPending}
          />
        </>
      )}
    </div>
  );
}
