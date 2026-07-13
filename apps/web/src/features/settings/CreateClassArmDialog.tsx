import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClassArmSchema, type CreateClassArmInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateClassArm } from "./use-class-arms";

interface CreateClassArmDialogProps {
  classLevelId: string;
  open: boolean;
  onClose: () => void;
}

export function CreateClassArmDialog({ classLevelId, open, onClose }: CreateClassArmDialogProps) {
  const createClassArm = useCreateClassArm();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateClassArmInput>({
    resolver: zodResolver(createClassArmSchema),
    defaultValues: { name: "", classLevelId },
  });

  const onSubmit = handleSubmit((values) => {
    createClassArm.mutate(
      { ...values, classLevelId },
      {
        onSuccess: () => {
          reset({ name: "", classLevelId });
          onClose();
        },
      },
    );
  });

  return (
    <Dialog open={open} onClose={onClose} title="New class arm">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">New class arm</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="arm-name">Name</Label>
          <Input id="arm-name" placeholder="e.g. A" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        {createClassArm.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(createClassArm.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createClassArm.isPending}>
            {createClassArm.isPending && <Spinner className="mr-2" />}
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
