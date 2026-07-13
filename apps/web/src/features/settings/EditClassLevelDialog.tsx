import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateClassLevelSchema, type ClassLevel, type UpdateClassLevelInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useUpdateClassLevel } from "./use-class-levels";

interface EditClassLevelDialogProps {
  classLevel: ClassLevel;
  open: boolean;
  onClose: () => void;
}

export function EditClassLevelDialog({ classLevel, open, onClose }: EditClassLevelDialogProps) {
  const updateClassLevel = useUpdateClassLevel();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateClassLevelInput>({
    resolver: zodResolver(updateClassLevelSchema),
    defaultValues: { name: classLevel.name, rank: classLevel.rank },
  });

  useEffect(() => {
    if (open) {
      reset({ name: classLevel.name, rank: classLevel.rank });
    }
  }, [open, classLevel, reset]);

  const onSubmit = handleSubmit((values) => {
    updateClassLevel.mutate({ id: classLevel.id, input: values }, { onSuccess: () => onClose() });
  });

  return (
    <Dialog open={open} onClose={onClose} title="Edit class level">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Edit class level</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-level-name">Name</Label>
          <Input id="edit-level-name" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-level-rank">Rank</Label>
          <Input id="edit-level-rank" type="number" {...register("rank")} />
          <FieldError message={errors.rank?.message} />
        </div>
        {updateClassLevel.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(updateClassLevel.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateClassLevel.isPending}>
            {updateClassLevel.isPending && <Spinner className="mr-2" />}
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
