import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { holidayFormSchema, type Holiday, type HolidayFormInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { StyledDatePicker } from "../../components/ui/styled-date-picker";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateHoliday, useUpdateHoliday } from "./use-holidays";

interface HolidayFormDialogProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  /** When set, edits this holiday instead of creating a new one. */
  holiday?: Holiday | null;
}

const BLANK: HolidayFormInput = { name: "", startDate: "", endDate: "" };

// sessionId/termId come from props, merged in at submit time — NOT part
// of the validated form schema, same shape as EvaluationFormDialog's
// classArmId/subjectId/termId (relying on react-hook-form defaultValues
// alone for an unregistered field is the fragile path that shape avoids).
// sessionId is fixed at creation (not re-scopable — see use-holidays.ts's
// UpdateHolidayInput) so the edit form doesn't offer a session field at
// all, only name/dates. termId isn't editable here either: Step 1 has no
// term picker UI yet (the create form only ever sends termId: null) —
// attaching a holiday to a specific term is left for a later step.
export function HolidayFormDialog({ open, onClose, sessionId, holiday }: HolidayFormDialogProps) {
  const isEdit = holiday != null;
  const createHoliday = useCreateHoliday();
  const updateHoliday = useUpdateHoliday();
  const mutation = isEdit ? updateHoliday : createHoliday;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<HolidayFormInput>({
    resolver: zodResolver(holidayFormSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (open) {
      reset(holiday ? { name: holiday.name, startDate: holiday.startDate.slice(0, 10), endDate: holiday.endDate.slice(0, 10) } : BLANK);
    }
  }, [open, holiday, reset]);

  const onSubmit = handleSubmit((values) => {
    if (isEdit && holiday) {
      updateHoliday.mutate({ id: holiday.id, input: values }, { onSuccess: () => onClose() });
    } else {
      createHoliday.mutate({ ...values, sessionId, termId: null }, { onSuccess: () => onClose() });
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit holiday" : "New holiday"}>
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">{isEdit ? "Edit holiday" : "New holiday"}</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="holiday-name">Name</Label>
          <Input id="holiday-name" placeholder="e.g. Christmas break" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="holiday-start-date">Starts</Label>
            <Controller
              name="startDate"
              control={control}
              render={({ field }) => (
                <StyledDatePicker id="holiday-start-date" value={field.value} onChange={field.onChange} placeholder="Select a date…" />
              )}
            />
            <FieldError message={errors.startDate?.message} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="holiday-end-date">Ends</Label>
            <Controller
              name="endDate"
              control={control}
              render={({ field }) => (
                <StyledDatePicker id="holiday-end-date" value={field.value} onChange={field.onChange} placeholder="Select a date…" />
              )}
            />
            <FieldError message={errors.endDate?.message} />
          </div>
        </div>
        <p className="text-xs text-muted">A single-day holiday has the same start and end date.</p>

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
