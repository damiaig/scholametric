import { useState } from "react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useTeachers } from "../teachers/use-teachers";
import { useSetClassTeacher } from "./use-class-teacher";

interface AssignClassTeacherForArmDialogProps {
  armId: string;
  armLabel: string;
  currentTeacherUserId: string | null;
  open: boolean;
  onClose: () => void;
}

const MAX_TEACHERS_FOR_PICKER = 100;

// Arm-centric mirror of teachers/AssignClassTeacherDialog: there the arm was
// picked for a fixed teacher; here the teacher is picked for a fixed arm.
// Same "assign/replace, no confirmation needed" semantics (PUT upserts).
export function AssignClassTeacherForArmDialog({
  armId,
  armLabel,
  currentTeacherUserId,
  open,
  onClose,
}: AssignClassTeacherForArmDialogProps) {
  const teachersQuery = useTeachers({ page: 1, pageSize: MAX_TEACHERS_FOR_PICKER, search: "" });
  const setClassTeacher = useSetClassTeacher();
  const [pendingTeacherId, setPendingTeacherId] = useState<string | null>(null);

  function handleClose() {
    setClassTeacher.reset();
    setPendingTeacherId(null);
    onClose();
  }

  function handleAssign(teacherUserId: string) {
    setPendingTeacherId(teacherUserId);
    setClassTeacher.mutate(
      { classArmId: armId, teacherUserId },
      { onSuccess: handleClose, onSettled: () => setPendingTeacherId(null) },
    );
  }

  const teachers = teachersQuery.data?.items ?? [];

  return (
    <Dialog open={open} onClose={handleClose} title="Assign class teacher" className="max-w-lg">
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-text">Assign class teacher for {armLabel}</h2>

        {teachersQuery.isLoading && <p className="text-sm text-muted">Loading teachers…</p>}
        {teachersQuery.isError && <p className="text-sm text-danger">Couldn't load teachers.</p>}
        {setClassTeacher.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(setClassTeacher.error)}
          </p>
        )}

        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {teachers.map((teacher) => (
            <div
              key={teacher.id}
              className="flex items-center justify-between gap-3 rounded-md border border-muted/20 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">
                  {teacher.firstName} {teacher.lastName}
                </p>
                <p className="font-mono text-xs text-muted">{teacher.staffNumber}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={setClassTeacher.isPending}
                onClick={() => handleAssign(teacher.id)}
              >
                {setClassTeacher.isPending && pendingTeacherId === teacher.id && <Spinner className="mr-2" />}
                {teacher.id === currentTeacherUserId ? "Current" : "Assign"}
              </Button>
            </div>
          ))}
          {teachers.length === 0 && !teachersQuery.isLoading && (
            <p className="text-sm text-muted">No teachers found.</p>
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
