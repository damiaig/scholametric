import { useState } from "react";
import { Plus, Pencil, Star, Trash2 } from "lucide-react";
import { GUARDIAN_RELATIONSHIP_LABELS, type StudentGuardianSummary } from "@scholametric/shared";
import { Button } from "../../../components/ui/button";
import { StatusBadge } from "../../../components/StatusBadge";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Spinner } from "../../../components/ui/spinner";
import { ApiError, getErrorMessage } from "../../../lib/api-client";
import {
  useRemoveGuardian,
  useSetPrimaryGuardian,
  useStudentGuardians,
} from "./use-student-guardians";
import { AddGuardianDialog } from "./AddGuardianDialog";
import { EditGuardianDialog } from "./EditGuardianDialog";

interface GuardiansSectionProps {
  studentId: string;
  canManage: boolean;
}

export function GuardiansSection({ studentId, canManage }: GuardiansSectionProps) {
  const guardiansQuery = useStudentGuardians(studentId);
  const setPrimary = useSetPrimaryGuardian(studentId);
  const removeGuardian = useRemoveGuardian(studentId);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<StudentGuardianSummary | null>(null);
  const [removing, setRemoving] = useState<StudentGuardianSummary | null>(null);
  const [forceRemoving, setForceRemoving] = useState<StudentGuardianSummary | null>(null);

  function handleRemoveConfirm() {
    if (!removing) return;
    removeGuardian.mutate(
      { guardianId: removing.guardianId },
      {
        onSuccess: () => setRemoving(null),
        onError: (error) => {
          // The only-guardian rule (400) needs a force retry, not just an
          // inline message — escalate to a more serious second dialog.
          // The primary-with-others rule (409) has nothing further to do
          // but read the message and cancel, so it stays inline below.
          if (error instanceof ApiError && error.status === 400) {
            setForceRemoving(removing);
            setRemoving(null);
          }
        },
      },
    );
  }

  function handleForceRemoveConfirm() {
    if (!forceRemoving) return;
    removeGuardian.mutate(
      { guardianId: forceRemoving.guardianId, force: true },
      { onSuccess: () => setForceRemoving(null) },
    );
  }

  if (guardiansQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading guardians…
      </div>
    );
  }

  if (guardiansQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-muted/20 bg-card p-6 text-center">
        <p className="text-sm text-danger">{getErrorMessage(guardiansQuery.error, "Couldn't load guardians.")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => guardiansQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const guardians = guardiansQuery.data ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Guardians</h2>
        {canManage && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add guardian
          </Button>
        )}
      </div>

      {guardians.length === 0 ? (
        <p className="text-sm text-muted">No guardians on record.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {guardians.map((guardian) => (
            <div
              key={guardian.guardianId}
              className="flex flex-col gap-2 rounded-lg border border-muted/20 bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text">
                    {guardian.firstName} {guardian.lastName}
                  </p>
                  {guardian.isPrimary && <StatusBadge label="Primary" tone="info" />}
                </div>
                <p className="text-xs text-muted">
                  {GUARDIAN_RELATIONSHIP_LABELS[guardian.relationship]} · {guardian.phone}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  {!guardian.isPrimary && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Make ${guardian.firstName} ${guardian.lastName} primary`}
                      disabled={setPrimary.isPending}
                      onClick={() => setPrimary.mutate(guardian.guardianId)}
                    >
                      <Star className="mr-2 h-4 w-4" aria-hidden="true" /> Make primary
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Edit ${guardian.firstName} ${guardian.lastName}`}
                    onClick={() => setEditing(guardian)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Remove ${guardian.firstName} ${guardian.lastName}`}
                    className="text-danger hover:bg-danger/10"
                    onClick={() => setRemoving(guardian)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {setPrimary.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {getErrorMessage(setPrimary.error)}
        </p>
      )}

      {canManage && (
        <>
          <AddGuardianDialog studentId={studentId} open={addOpen} onClose={() => setAddOpen(false)} />
          {editing && (
            <EditGuardianDialog
              studentId={studentId}
              guardian={editing}
              open={editing !== null}
              onClose={() => setEditing(null)}
            />
          )}

          <ConfirmDialog
            open={removing !== null}
            onClose={() => {
              setRemoving(null);
              removeGuardian.reset();
            }}
            onConfirm={handleRemoveConfirm}
            title="Remove guardian"
            description={
              removing ? `This removes ${removing.firstName} ${removing.lastName} as a guardian for this student.` : ""
            }
            confirmLabel="Remove"
            confirmTone="danger"
            isConfirming={removeGuardian.isPending}
          >
            {removeGuardian.isError && removing && (
              <p role="alert" className="text-sm text-danger">
                {getErrorMessage(removeGuardian.error)}
              </p>
            )}
          </ConfirmDialog>

          <ConfirmDialog
            open={forceRemoving !== null}
            onClose={() => {
              setForceRemoving(null);
              removeGuardian.reset();
            }}
            onConfirm={handleForceRemoveConfirm}
            title="Remove the only guardian?"
            description={
              forceRemoving
                ? `${forceRemoving.firstName} ${forceRemoving.lastName} is this student's only guardian. Removing them leaves the student with no guardian on record at all.`
                : ""
            }
            confirmLabel="Remove anyway"
            confirmTone="danger"
            isConfirming={removeGuardian.isPending}
            requireTypedConfirmation={forceRemoving ? forceRemoving.lastName : undefined}
          >
            {removeGuardian.isError && forceRemoving && (
              <p role="alert" className="text-sm text-danger">
                {getErrorMessage(removeGuardian.error)}
              </p>
            )}
          </ConfirmDialog>
        </>
      )}
    </div>
  );
}
