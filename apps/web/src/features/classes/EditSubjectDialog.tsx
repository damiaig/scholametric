import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateSubjectSchema, type SubjectWithLevels, type UpdateSubjectInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useUpdateSubject } from "./use-subjects";

interface EditSubjectDialogProps {
  subject: SubjectWithLevels;
  open: boolean;
  onClose: () => void;
}

function toDefaults(subject: SubjectWithLevels): UpdateSubjectInput {
  return { name: subject.name, code: subject.code ?? "" };
}

export function EditSubjectDialog({ subject, open, onClose }: EditSubjectDialogProps) {
  const updateSubject = useUpdateSubject();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateSubjectInput>({
    resolver: zodResolver(updateSubjectSchema),
    defaultValues: toDefaults(subject),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaults(subject));
    }
  }, [open, subject, reset]);

  const onSubmit = handleSubmit((values) => {
    updateSubject.mutate({ id: subject.id, input: values }, { onSuccess: () => onClose() });
  });

  return (
    <Dialog open={open} onClose={onClose} title="Edit subject">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Edit subject</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-subject-name">Name</Label>
          <Input id="edit-subject-name" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-subject-code">Code (optional)</Label>
          <Input id="edit-subject-code" {...register("code")} />
          <FieldError message={errors.code?.message} />
        </div>
        {updateSubject.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(updateSubject.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateSubject.isPending}>
            {updateSubject.isPending && <Spinner className="mr-2" />}
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
