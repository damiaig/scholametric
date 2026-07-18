import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addClassArmSchema, type AddClassArmInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useAddClassArm } from "./use-class-arms";

interface AddClassArmDialogProps {
  classLevelId: string;
  levelName: string;
  suggestedName: string;
  open: boolean;
  onClose: () => void;
}

// Next-letter suggestion pre-fills the name field but stays fully editable
// (SPEC_V0.2.md §4: "auto-suggest the next letter... editable").
export function AddClassArmDialog({ classLevelId, levelName, suggestedName, open, onClose }: AddClassArmDialogProps) {
  const addClassArm = useAddClassArm(classLevelId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddClassArmInput>({
    resolver: zodResolver(addClassArmSchema),
    defaultValues: { name: suggestedName },
  });

  useEffect(() => {
    if (open) {
      reset({ name: suggestedName });
      addClassArm.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestedName]);

  const onSubmit = handleSubmit((values) => {
    addClassArm.mutate(values, { onSuccess: onClose });
  });

  return (
    <Dialog open={open} onClose={onClose} title={`Add arm to ${levelName}`}>
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Add arm to {levelName}</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="arm-name">Name</Label>
          <Input id="arm-name" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        {addClassArm.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(addClassArm.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={addClassArm.isPending}>
            {addClassArm.isPending && <Spinner className="mr-2" />}
            Add
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
