import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ANY_WEEKDAY_LABELS, createTeacherAbsenceSchema, type CreateTeacherAbsenceInput, type ResolvedTimetableDay } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { formatDate } from "../../lib/format-date";
import { useCreateTeacherAbsence } from "./use-teacher-absences";

interface AbsenceMarkingDialogProps {
  open: boolean;
  onClose: () => void;
  /** The currently-loaded week of the teacher's own resolved schedule — the only source of "which periods am I actually teaching on which date." */
  days: ResolvedTimetableDay[];
}

const BLANK: CreateTeacherAbsenceInput = { date: "", periodIds: [], note: "" };

// v0.8 step 4 (SPEC_V0.8.md §4) — a teacher marks themselves absent for
// one or more periods on a date. Dates are limited to the currently-loaded
// week (no separate lookup endpoint exists for "what do I teach on an
// arbitrary future date" — a teacher opens their timetable and acts on
// what they see, matching the spec's own framing). Periods offered for a
// chosen date are further limited to ones actually scheduled that day and
// not already cancelled/replaced — there's nothing meaningful to re-mark.
export function AbsenceMarkingDialog({ open, onClose, days }: AbsenceMarkingDialogProps) {
  const createAbsence = useCreateTeacherAbsence();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateTeacherAbsenceInput>({
    resolver: zodResolver(createTeacherAbsenceSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (open) {
      reset(BLANK);
    }
  }, [open, reset]);

  const schoolDays = days.filter((day) => day.isSchoolDay);
  const selectedDate = watch("date");
  const selectedDay = schoolDays.find((day) => day.date === selectedDate);
  const availablePeriods = selectedDay ? selectedDay.periods.filter((period) => period.subjectName && !period.status) : [];

  useEffect(() => {
    setValue("periodIds", []);
  }, [selectedDate, setValue]);

  const onSubmit = handleSubmit((values) => {
    createAbsence.mutate(values, {
      onSuccess: () => {
        reset(BLANK);
        onClose();
      },
    });
  });

  return (
    <Dialog open={open} onClose={onClose} title="Mark yourself absent">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Mark yourself absent</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="absence-date">Date</Label>
          <Select id="absence-date" {...register("date")}>
            <option value="">Select a date…</option>
            {schoolDays.map((day) => (
              <option key={day.date} value={day.date}>
                {ANY_WEEKDAY_LABELS[day.dayOfWeek]} · {formatDate(day.date)}
              </option>
            ))}
          </Select>
          <FieldError message={errors.date?.message} />
        </div>

        {selectedDate && (
          <div className="flex flex-col gap-1.5">
            <Label>Periods</Label>
            {availablePeriods.length === 0 ? (
              <p className="text-sm text-muted">No periods available to mark absent on this date.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {availablePeriods.map((period) => (
                  <label key={period.periodId} className="flex items-center gap-2 text-sm text-text">
                    <Checkbox value={period.periodId} {...register("periodIds")} />
                    {period.periodName} — {period.subjectName}
                    {period.className ? ` (${period.className})` : ""}
                  </label>
                ))}
              </div>
            )}
            <FieldError message={errors.periodIds?.message} />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="absence-note">Note</Label>
          <Textarea id="absence-note" placeholder="Reason for your absence" {...register("note")} />
          <FieldError message={errors.note?.message} />
        </div>

        {createAbsence.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(createAbsence.error)}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createAbsence.isPending}>
            {createAbsence.isPending && <Spinner className="mr-2" />}
            Mark absent
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
