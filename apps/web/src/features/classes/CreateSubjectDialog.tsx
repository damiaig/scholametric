import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSubjectSchema, type CreateSubjectInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateSubject } from "./use-subjects";

interface CreateSubjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateSubjectDialog({ open, onClose }: CreateSubjectDialogProps) {
  const createSubject = useCreateSubject();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateSubjectInput>({
    resolver: zodResolver(createSubjectSchema),
    defaultValues: { name: "", code: "" },
  });

  function handleClose() {
    reset();
    createSubject.reset();
    onClose();
  }

  const onSubmit = handleSubmit((values) => {
    createSubject.mutate(values, { onSuccess: handleClose });
  });

  return (
    <Dialog open={open} onClose={handleClose} title="New subject">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">New subject</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subject-name">Name</Label>
          <Input id="subject-name" placeholder="e.g. Mathematics" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subject-code">Code (optional)</Label>
          <Input id="subject-code" placeholder="e.g. MTH" {...register("code")} />
          <FieldError message={errors.code?.message} />
        </div>
        {createSubject.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(createSubject.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createSubject.isPending}>
            {createSubject.isPending && <Spinner className="mr-2" />}
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
