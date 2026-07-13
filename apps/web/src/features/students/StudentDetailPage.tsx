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
import { useStudent } from "./use-student";
import { studentStatusTone, studentStatusLabel } from "./student-status";
import { useCanManageStudents } from "./use-can-manage-students";
import { EditStudentDialog } from "./EditStudentDialog";
import { TransferClassDialog } from "./TransferClassDialog";
import { WithdrawStudentDialog } from "./WithdrawStudentDialog";

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
  const canManage = useCanManageStudents();
  const studentQuery = useStudent(id);
  const [tab, setTab] = useState<TabKey>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

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
        {(["overview", "history"] as const).map((key) => (
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
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <InfoRow label="First name" value={student.firstName} />
          <InfoRow label="Last name" value={student.lastName} />
          <InfoRow label="Middle name" value={student.middleName} />
          <InfoRow label="Gender" value={student.gender === "MALE" ? "Male" : "Female"} />
          <InfoRow label="Date of birth" value={formatDate(student.dateOfBirth)} />
          <InfoRow label="Guardian name" value={student.guardianName} />
          <InfoRow label="Guardian phone" value={student.guardianPhone} />
          <InfoRow label="Guardian email" value={student.guardianEmail} />
          <InfoRow label="Address" value={student.address} />
        </dl>
      )}

      {tab === "history" && (
        <div>
          {student.currentEnrollment ? (
            <div className="rounded-lg border border-muted/20 p-4">
              <p className="font-medium text-text">
                {student.currentEnrollment.classArm.classLevel.name} {student.currentEnrollment.classArm.name}
              </p>
              <p className="text-sm text-muted">
                {student.currentEnrollment.session.name} · enrolled{" "}
                {formatDate(student.currentEnrollment.enrolledOn)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">No enrollment on record.</p>
          )}
          <p className="mt-4 text-sm text-muted">Audit trail will be available in a future version.</p>
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
