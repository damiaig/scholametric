import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClassLevelSchema, type CreateClassLevelInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateClassLevel } from "./use-class-levels";

interface AddClassLevelDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddClassLevelDialog({ open, onClose }: AddClassLevelDialogProps) {
  const createClassLevel = useCreateClassLevel();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateClassLevelInput>({
    resolver: zodResolver(createClassLevelSchema),
    defaultValues: { name: "", rank: 0 },
  });

  function handleClose() {
    reset();
    createClassLevel.reset();
    onClose();
  }

  const onSubmit = handleSubmit((values) => {
    createClassLevel.mutate(values, { onSuccess: handleClose });
  });

  return (
    <Dialog open={open} onClose={handleClose} title="Add class level">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Add class level</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="level-name">Name</Label>
          <Input id="level-name" placeholder="e.g. JSS 1" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="level-rank">Rank</Label>
          <Input id="level-rank" type="number" {...register("rank")} />
          <FieldError message={errors.rank?.message} />
        </div>
        {createClassLevel.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(createClassLevel.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createClassLevel.isPending}>
            {createClassLevel.isPending && <Spinner className="mr-2" />}
            Add
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
