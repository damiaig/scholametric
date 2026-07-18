import { useState, type FormEvent } from "react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useTeachers } from "../teachers/use-teachers";
import { useAllSubjects } from "./use-subjects";
import { useCreateSubjectAssignment } from "./use-subject-assignments";

interface AddSubjectTeacherDialogProps {
  armId: string;
  open: boolean;
  onClose: () => void;
}

const MAX_TEACHERS_FOR_PICKER = 100;

// Arm-centric mirror of teachers/AddSubjectAssignmentDialog: there the
// teacher was fixed and arms were multi-selected; here the arm is fixed and
// exactly one subject + one teacher are picked (this arm only has one slot
// per subject, so there's no multi-select axis on this side).
export function AddSubjectTeacherDialog({ armId, open, onClose }: AddSubjectTeacherDialogProps) {
  const subjectsQuery = useAllSubjects();
  const teachersQuery = useTeachers({ page: 1, pageSize: MAX_TEACHERS_FOR_PICKER, search: "" });
  const createAssignment = useCreateSubjectAssignment();
  const [subjectId, setSubjectId] = useState("");
  const [teacherUserId, setTeacherUserId] = useState("");

  function handleClose() {
    setSubjectId("");
    setTeacherUserId("");
    createAssignment.reset();
    onClose();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!subjectId || !teacherUserId) return;
    createAssignment.mutate({ subjectId, classArmId: armId, teacherUserId }, { onSuccess: handleClose });
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Add subject teacher">
      <form className="flex flex-col gap-4 p-6" onSubmit={handleSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Add subject teacher</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="arm-subject-teacher-subject">Subject</Label>
          <Select
            id="arm-subject-teacher-subject"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
          >
            <option value="" disabled>
              Select a subject…
            </option>
            {(subjectsQuery.data ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="arm-subject-teacher-teacher">Teacher</Label>
          <Select
            id="arm-subject-teacher-teacher"
            value={teacherUserId}
            onChange={(event) => setTeacherUserId(event.target.value)}
          >
            <option value="" disabled>
              Select a teacher…
            </option>
            {(teachersQuery.data?.items ?? []).map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.firstName} {teacher.lastName}
              </option>
            ))}
          </Select>
        </div>

        {createAssignment.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(createAssignment.error)}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createAssignment.isPending || !subjectId || !teacherUserId}>
            {createAssignment.isPending && <Spinner className="mr-2" />}
            Add
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
