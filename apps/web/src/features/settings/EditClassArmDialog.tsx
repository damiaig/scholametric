import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateClassArmSchema, type ClassArm, type UpdateClassArmInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useUpdateClassArm } from "./use-class-arms";
import { useAllClassLevels } from "./use-class-levels";

interface EditClassArmDialogProps {
  classArm: ClassArm;
  open: boolean;
  onClose: () => void;
}

export function EditClassArmDialog({ classArm, open, onClose }: EditClassArmDialogProps) {
  const updateClassArm = useUpdateClassArm();
  const classLevels = useAllClassLevels();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateClassArmInput>({
    resolver: zodResolver(updateClassArmSchema),
    defaultValues: { name: classArm.name, classLevelId: classArm.classLevelId },
  });

  useEffect(() => {
    if (open) {
      reset({ name: classArm.name, classLevelId: classArm.classLevelId });
    }
  }, [open, classArm, reset]);

  const onSubmit = handleSubmit((values) => {
    updateClassArm.mutate({ id: classArm.id, input: values }, { onSuccess: () => onClose() });
  });

  return (
    <Dialog open={open} onClose={onClose} title="Edit class arm">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Edit class arm</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-arm-name">Name</Label>
          <Input id="edit-arm-name" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-arm-level">Class level</Label>
          <Select id="edit-arm-level" disabled={classLevels.isLoading} {...register("classLevelId")}>
            {(classLevels.data ?? []).map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </Select>
          <FieldError message={errors.classLevelId?.message} />
        </div>
        {updateClassArm.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(updateClassArm.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateClassArm.isPending}>
            {updateClassArm.isPending && <Spinner className="mr-2" />}
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
