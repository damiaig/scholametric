import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateStudentSchema, type Student, type UpdateStudentInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { StudentBioFields } from "./StudentBioFields";
import { useUpdateStudent } from "./use-update-student";

interface EditStudentDialogProps {
  student: Student;
  open: boolean;
  onClose: () => void;
}

function toDefaults(student: Student): UpdateStudentInput {
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    middleName: student.middleName ?? "",
    gender: student.gender,
    dateOfBirth: student.dateOfBirth.slice(0, 10),
  };
}

// Bio fields only, v0.2 — guardian fields moved to the Guardians section
// (GuardiansSection.tsx) on the student detail page, matching
// UpdateStudentDto's own shape (no guardian fields accepted anymore).
export function EditStudentDialog({ student, open, onClose }: EditStudentDialogProps) {
  const updateStudent = useUpdateStudent(student.id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateStudentInput>({
    resolver: zodResolver(updateStudentSchema),
    defaultValues: toDefaults(student),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaults(student));
    }
  }, [open, student, reset]);

  const onSubmit = handleSubmit((values) => {
    updateStudent.mutate(values, { onSuccess: () => onClose() });
  });

  return (
    <Dialog open={open} onClose={onClose} title="Edit student" className="max-w-2xl">
      <form className="flex max-h-[80vh] flex-col overflow-y-auto" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-6 p-6">
          <h2 className="text-lg font-semibold text-text">Edit student</h2>
          <StudentBioFields register={register} errors={errors} />
          {updateStudent.isError && (
            <p role="alert" className="text-sm text-danger">
              {getErrorMessage(updateStudent.error)}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-muted/20 p-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateStudent.isPending}>
            {updateStudent.isPending && <Spinner className="mr-2" />}
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
