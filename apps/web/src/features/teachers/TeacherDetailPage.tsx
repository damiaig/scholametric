import { useState, type ReactNode } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { JOB_TITLE_LABELS } from "@scholametric/shared";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { formatDate } from "../../lib/format-date";
import { isSchoolAdmin } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { useTeacher } from "./use-teachers";
import { useRemoveClassTeacher } from "../classes/use-class-teacher";
import { useRemoveSubjectAssignment } from "../classes/use-subject-assignments";
import { AssignClassTeacherDialog } from "./AssignClassTeacherDialog";
import { AddSubjectAssignmentDialog } from "./AddSubjectAssignmentDialog";

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm text-text">{value || "—"}</dd>
    </div>
  );
}

export function TeacherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const canManage = isSchoolAdmin(currentUser?.role);

  const teacherQuery = useTeacher(id);
  const removeClassTeacher = useRemoveClassTeacher();
  const removeSubjectAssignment = useRemoveSubjectAssignment();

  const [assignOpen, setAssignOpen] = useState(false);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [removingClassArmId, setRemovingClassArmId] = useState<string | null>(null);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);

  if (teacherQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading teacher…
      </div>
    );
  }

  if (teacherQuery.isError || !teacherQuery.data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
        <p className="text-sm text-danger">{getErrorMessage(teacherQuery.error, "Couldn't load this teacher.")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => teacherQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const teacher = teacherQuery.data;

  return (
    <div>
      <Button type="button" variant="outline" size="sm" className="mb-4" onClick={() => navigate("/teachers")}>
        Back to teachers
      </Button>

      <PageHeader title={`${teacher.firstName} ${teacher.lastName}`} />

      <div className="mb-6 flex items-center gap-4 rounded-lg border border-muted/20 bg-card p-4">
        <Avatar firstName={teacher.firstName} lastName={teacher.lastName} className="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm text-muted">{teacher.staffNumber}</p>
          <p className="text-sm text-text">{JOB_TITLE_LABELS[teacher.jobTitle] ?? teacher.jobTitle}</p>
        </div>
        <StatusBadge
          label={teacher.status === "ACTIVE" ? "Active" : "Disabled"}
          tone={teacher.status === "ACTIVE" ? "success" : "neutral"}
        />
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-text">Details</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <InfoRow label="Email" value={teacher.email} />
          <InfoRow label="Phone" value={teacher.phone} />
          <InfoRow label="Qualification" value={teacher.qualification} />
          <InfoRow label="Date employed" value={teacher.dateEmployed ? formatDate(teacher.dateEmployed) : null} />
        </dl>
      </section>

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Class teacher of</h2>
          {canManage && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Assign
            </Button>
          )}
        </div>
        {teacher.classTeacherOf.length === 0 ? (
          <p className="text-sm text-muted">Not currently a class teacher for any arm.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {teacher.classTeacherOf.map((entry) => (
              <div
                key={entry.classArmId}
                className="flex items-center justify-between rounded-lg border border-muted/20 bg-card p-3"
              >
                <div>
                  <Link
                    to={`/classes/arms/${entry.classArmId}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {entry.className}
                  </Link>
                  <p className="text-xs text-muted">{entry.sessionName}</p>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Remove class teacher for ${entry.className}`}
                    className="text-danger hover:bg-danger/10"
                    onClick={() => setRemovingClassArmId(entry.classArmId)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Subjects taught</h2>
          {canManage && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAddSubjectOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add subject
            </Button>
          )}
        </div>
        {teacher.subjectsTaught.length === 0 ? (
          <p className="text-sm text-muted">No subjects assigned this session.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-muted/20 bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-muted/20">
                  <th className="px-4 py-3 font-medium text-muted">Subject</th>
                  <th className="px-4 py-3 font-medium text-muted">Class</th>
                  {canManage && <th className="px-4 py-3 font-medium text-muted" />}
                </tr>
              </thead>
              <tbody>
                {teacher.subjectsTaught.map((entry) => (
                  <tr key={entry.id} className="border-b border-muted/10 last:border-0">
                    <td className="px-4 py-3 text-text">{entry.subjectName}</td>
                    <td className="px-4 py-3">
                      <Link to={`/classes/arms/${entry.classArmId}`} className="text-primary hover:underline">
                        {entry.className}
                      </Link>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`Remove ${entry.subjectName} for ${entry.className}`}
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
        )}
      </section>

      {canManage && (
        <>
          <AssignClassTeacherDialog
            teacherId={teacher.id}
            teacherName={`${teacher.firstName} ${teacher.lastName}`}
            open={assignOpen}
            onClose={() => setAssignOpen(false)}
          />
          <AddSubjectAssignmentDialog teacherId={teacher.id} open={addSubjectOpen} onClose={() => setAddSubjectOpen(false)} />

          <ConfirmDialog
            open={removingClassArmId !== null}
            onClose={() => setRemovingClassArmId(null)}
            onConfirm={() => {
              if (!removingClassArmId) return;
              removeClassTeacher.mutate(removingClassArmId, { onSuccess: () => setRemovingClassArmId(null) });
            }}
            title="Remove class teacher"
            description="This unassigns the class teacher for this arm. It can be reassigned at any time."
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
            title="Remove subject assignment"
            description="This removes the subject from this teacher for the current class and session."
            confirmLabel="Remove"
            confirmTone="danger"
            isConfirming={removeSubjectAssignment.isPending}
          />
        </>
      )}
    </div>
  );
}
