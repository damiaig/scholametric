import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { breakInputSchema, type Break, type BreakInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateBreak, useUpdateBreak } from "./use-breaks";

interface BreakFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** When set, edits this break instead of creating a new one. */
  brk?: Break | null;
}

const BLANK: BreakInput = { name: "", startsAt: "", endsAt: "" };

export function BreakFormDialog({ open, onClose, brk }: BreakFormDialogProps) {
  const isEdit = brk != null;
  const createBreak = useCreateBreak();
  const updateBreak = useUpdateBreak();
  const mutation = isEdit ? updateBreak : createBreak;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BreakInput>({
    resolver: zodResolver(breakInputSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (open) {
      reset(brk ? { name: brk.name, startsAt: brk.startsAt, endsAt: brk.endsAt } : BLANK);
    }
  }, [open, brk, reset]);

  const onSubmit = handleSubmit((values) => {
    if (isEdit && brk) {
      updateBreak.mutate({ id: brk.id, input: values }, { onSuccess: () => onClose() });
    } else {
      createBreak.mutate(values, { onSuccess: () => onClose() });
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit break" : "New break"}>
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">{isEdit ? "Edit break" : "New break"}</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="break-name">Name</Label>
          <Input id="break-name" placeholder="e.g. Lunch" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="break-starts-at">Starts</Label>
            <Input id="break-starts-at" type="time" {...register("startsAt")} />
            <FieldError message={errors.startsAt?.message} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="break-ends-at">Ends</Label>
            <Input id="break-ends-at" type="time" {...register("endsAt")} />
            <FieldError message={errors.endsAt?.message} />
          </div>
        </div>

        {mutation.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(mutation.error)}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="mr-2" />}
            {isEdit ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
