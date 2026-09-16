import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { periodInputSchema, type Period, type PeriodInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreatePeriod, useUpdatePeriod } from "./use-periods";

interface PeriodFormDialogProps {
  open: boolean;
  onClose: () => void;
  nextSortOrder: number;
  /** When set, edits this period instead of creating a new one. */
  period?: Period | null;
}

function blankValues(nextSortOrder: number): PeriodInput {
  return { name: "", startsAt: "", endsAt: "", sortOrder: nextSortOrder };
}

export function PeriodFormDialog({ open, onClose, nextSortOrder, period }: PeriodFormDialogProps) {
  const isEdit = period != null;
  const createPeriod = useCreatePeriod();
  const updatePeriod = useUpdatePeriod();
  const mutation = isEdit ? updatePeriod : createPeriod;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PeriodInput>({
    resolver: zodResolver(periodInputSchema),
    defaultValues: blankValues(nextSortOrder),
  });

  useEffect(() => {
    if (open) {
      reset(
        period
          ? { name: period.name, startsAt: period.startsAt, endsAt: period.endsAt, sortOrder: period.sortOrder }
          : blankValues(nextSortOrder),
      );
    }
  }, [open, period, nextSortOrder, reset]);

  const onSubmit = handleSubmit((values) => {
    if (isEdit && period) {
      updatePeriod.mutate({ id: period.id, input: values }, { onSuccess: () => onClose() });
    } else {
      createPeriod.mutate(values, { onSuccess: () => onClose() });
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit period" : "New period"}>
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">{isEdit ? "Edit period" : "New period"}</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="period-name">Name</Label>
          <Input id="period-name" placeholder="e.g. Period 1" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="period-starts-at">Starts</Label>
            <Input id="period-starts-at" type="time" {...register("startsAt")} />
            <FieldError message={errors.startsAt?.message} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="period-ends-at">Ends</Label>
            <Input id="period-ends-at" type="time" {...register("endsAt")} />
            <FieldError message={errors.endsAt?.message} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="period-sort-order">Order</Label>
          <Input id="period-sort-order" type="number" inputMode="numeric" {...register("sortOrder", { valueAsNumber: true })} />
          <FieldError message={errors.sortOrder?.message} />
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
