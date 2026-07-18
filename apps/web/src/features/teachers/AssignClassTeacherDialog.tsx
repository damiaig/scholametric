import { useState } from "react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useClasses } from "./use-classes";
import { useSetClassTeacher } from "./use-class-teacher";

interface AssignClassTeacherDialogProps {
  teacherId: string;
  teacherName: string;
  open: boolean;
  onClose: () => void;
}

// "Assign/replace" (SPEC_V0.2.md §4): every arm is listed with its current
// holder, if any — clicking Assign on any row (including one this teacher
// already holds) upsert-replaces it, per PUT /class-arms/:id/class-teacher's
// documented semantics (no confirmation needed; it's a clean replace).
export function AssignClassTeacherDialog({ teacherId, teacherName, open, onClose }: AssignClassTeacherDialogProps) {
  const classesQuery = useClasses();
  const setClassTeacher = useSetClassTeacher();
  const [pendingArmId, setPendingArmId] = useState<string | null>(null);

  function handleClose() {
    setClassTeacher.reset();
    setPendingArmId(null);
    onClose();
  }

  function handleAssign(armId: string) {
    setPendingArmId(armId);
    setClassTeacher.mutate(
      { classArmId: armId, teacherUserId: teacherId },
      {
        onSuccess: handleClose,
        onSettled: () => setPendingArmId(null),
      },
    );
  }

  const arms = (classesQuery.data ?? []).flatMap((level) =>
    level.arms.map((arm) => ({ id: arm.id, label: `${level.name} ${arm.name}`, classTeacher: arm.classTeacher })),
  );

  return (
    <Dialog open={open} onClose={handleClose} title="Assign class teacher" className="max-w-lg">
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-text">Assign {teacherName} as class teacher</h2>

        {classesQuery.isLoading && <p className="text-sm text-muted">Loading classes…</p>}
        {classesQuery.isError && <p className="text-sm text-danger">Couldn't load classes.</p>}
        {setClassTeacher.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(setClassTeacher.error)}
          </p>
        )}

        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {arms.map((arm) => (
            <div
              key={arm.id}
              className="flex items-center justify-between gap-3 rounded-md border border-muted/20 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">{arm.label}</p>
                <p className="text-xs text-muted">
                  {arm.classTeacher
                    ? `Currently: ${arm.classTeacher.firstName} ${arm.classTeacher.lastName}`
                    : "No class teacher assigned"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={setClassTeacher.isPending}
                onClick={() => handleAssign(arm.id)}
              >
                {setClassTeacher.isPending && pendingArmId === arm.id && <Spinner className="mr-2" />}
                Assign
              </Button>
            </div>
          ))}
          {arms.length === 0 && !classesQuery.isLoading && (
            <p className="text-sm text-muted">No classes configured yet.</p>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
