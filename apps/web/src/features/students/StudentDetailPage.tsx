import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, ArrowRightLeft, UserX } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { formatDate } from "../../lib/format-date";
import { humanizeAuditAction } from "../../lib/audit-labels";
import { useStudent } from "./use-student";
import { useStudentAuditLog } from "./use-student-audit-log";
import { studentStatusTone, studentStatusLabel } from "./student-status";
import { useCanManageStudents } from "./use-can-manage-students";
import { EditStudentDialog } from "./EditStudentDialog";
import { TransferClassDialog } from "./TransferClassDialog";
import { WithdrawStudentDialog } from "./WithdrawStudentDialog";
import { GuardiansSection } from "./guardians/GuardiansSection";

type TabKey = "overview" | "history";

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm text-text">{value || "—"}</dd>
    </div>
  );
}

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // History tab is PROPRIETOR/SCHOOL_ADMIN only, absent for TEACHER — matches
  // GET /audit-logs's own RBAC (no TEACHER access at all), not just a UI
  // restriction. See docs/DECISIONS.md.
  const canManage = useCanManageStudents();
  const studentQuery = useStudent(id);
  const [tab, setTab] = useState<TabKey>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  const auditLogQuery = useStudentAuditLog(id ?? "", historyPage, canManage);

  if (studentQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading student…
      </div>
    );
  }

  if (studentQuery.isError || !studentQuery.data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
        <p className="text-sm text-danger">{getErrorMessage(studentQuery.error, "Couldn't load this student.")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => studentQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const student = studentQuery.data;
  const classLabel = student.currentEnrollment
    ? `${student.currentEnrollment.classArm.classLevel.name} ${student.currentEnrollment.classArm.name}`
    : "No current class";

  const tabs: TabKey[] = canManage ? ["overview", "history"] : ["overview"];

  return (
    <div>
      <Button type="button" variant="outline" size="sm" className="mb-4" onClick={() => navigate("/students")}>
        Back to students
      </Button>

      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        actions={
          canManage ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
                <ArrowRightLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Transfer class
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-danger hover:bg-danger/10"
                onClick={() => setWithdrawOpen(true)}
                disabled={student.status === "WITHDRAWN"}
              >
                <UserX className="mr-2 h-4 w-4" aria-hidden="true" /> Withdraw
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-6 flex items-center gap-4 rounded-lg border border-muted/20 bg-card p-4">
        <Avatar firstName={student.firstName} lastName={student.lastName} className="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm text-muted">{student.admissionNumber}</p>
          <p className="text-sm text-text">{classLabel}</p>
        </div>
        <StatusBadge label={studentStatusLabel(student.status)} tone={studentStatusTone(student.status)} />
      </div>

      <div role="tablist" aria-label="Student sections" className="mb-4 flex gap-1 border-b border-muted/20">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={
              tab === key
                ? "border-b-2 border-primary px-3 py-2 text-sm font-medium text-primary"
                : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted hover:text-text"
            }
          >
            {key === "overview" ? "Overview" : "History"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="flex flex-col gap-8">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            <InfoRow label="First name" value={student.firstName} />
            <InfoRow label="Last name" value={student.lastName} />
            <InfoRow label="Middle name" value={student.middleName} />
            <InfoRow label="Gender" value={student.gender === "MALE" ? "Male" : "Female"} />
            <InfoRow label="Date of birth" value={formatDate(student.dateOfBirth)} />
          </dl>

          <GuardiansSection studentId={student.id} canManage={canManage} />
        </div>
      )}

      {tab === "history" && canManage && (
        <div>
          {student.currentEnrollment ? (
            <div className="mb-4 rounded-lg border border-muted/20 p-4">
              <p className="font-medium text-text">
                {student.currentEnrollment.classArm.classLevel.name} {student.currentEnrollment.classArm.name}
              </p>
              <p className="text-sm text-muted">
                {student.currentEnrollment.session.name} · enrolled{" "}
                {formatDate(student.currentEnrollment.enrolledOn)}
              </p>
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted">No enrollment on record.</p>
          )}

          {auditLogQuery.isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Loading history…
            </p>
          )}
          {auditLogQuery.isError && (
            <p className="text-sm text-danger">{getErrorMessage(auditLogQuery.error, "Couldn't load history.")}</p>
          )}
          {auditLogQuery.data && auditLogQuery.data.items.length === 0 && (
            <p className="text-sm text-muted">No recorded activity yet.</p>
          )}
          {auditLogQuery.data && auditLogQuery.data.items.length > 0 && (
            <div className="flex flex-col gap-2">
              {auditLogQuery.data.items.map((entry) => {
                const reason =
                  entry.action === "student.withdraw" &&
                  entry.metadata &&
                  typeof entry.metadata === "object" &&
                  "reason" in entry.metadata
                    ? String((entry.metadata as { reason: unknown }).reason)
                    : null;
                return (
                  <div key={entry.id} className="rounded-lg border border-muted/20 bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-text">{humanizeAuditAction(entry.action)}</p>
                      <p className="text-xs text-muted">{formatDate(entry.createdAt)}</p>
                    </div>
                    <p className="text-xs text-muted">
                      {entry.actor.firstName} {entry.actor.lastName}
                    </p>
                    {reason && <p className="mt-1 text-sm text-text">Reason: {reason}</p>}
                  </div>
                );
              })}
              {auditLogQuery.data.total > auditLogQuery.data.pageSize && (
                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((page) => page - 1)}
                  >
                    Previous
                  </Button>
                  <p className="text-xs text-muted">
                    Page {auditLogQuery.data.page} of{" "}
                    {Math.max(1, Math.ceil(auditLogQuery.data.total / auditLogQuery.data.pageSize))}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={historyPage >= Math.ceil(auditLogQuery.data.total / auditLogQuery.data.pageSize)}
                    onClick={() => setHistoryPage((page) => page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {canManage && (
        <>
          <EditStudentDialog student={student} open={editOpen} onClose={() => setEditOpen(false)} />
          <TransferClassDialog student={student} open={transferOpen} onClose={() => setTransferOpen(false)} />
          <WithdrawStudentDialog
            student={student}
            open={withdrawOpen}
            onClose={() => setWithdrawOpen(false)}
          />
        </>
      )}
    </div>
  );
}
