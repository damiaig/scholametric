import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  timetableSlotFormSchema,
  WEEKDAY_LABELS,
  type ClassArmSubjectTeacher,
  type TimetableSlot,
  type TimetableSlotFormInput,
  type WeekdayValue,
} from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateTimetableSlot, useUpdateTimetableSlot } from "./use-timetable-slots";

interface TimetableSlotFormDialogProps {
  open: boolean;
  onClose: () => void;
  classArmId: string;
  sessionId: string;
  dayOfWeek: WeekdayValue;
  periodId: string;
  periodName: string;
  /** Every subject this class has a teacher assigned for — the ONLY thing this dialog lets you pick. */
  subjectTeachers: ClassArmSubjectTeacher[];
  /** When set, edits this slot instead of creating a new one. */
  slot?: TimetableSlot | null;
}

const BLANK: TimetableSlotFormInput = { subjectId: "" };

// The dialog's only field is Subject — teacherUserId is derived from
// subjectTeachers (already fetched by the builder page), never
// independently picked. The backend enforces exactly one teacher per
// (subject, classArm, session) anyway, so a separate teacher control
// could only ever construct a combination the backend guarantees will
// 400 (see packages/shared/src/calendar.ts's own comment on this).
export function TimetableSlotFormDialog({
  open,
  onClose,
  classArmId,
  sessionId,
  dayOfWeek,
  periodId,
  periodName,
  subjectTeachers,
  slot,
}: TimetableSlotFormDialogProps) {
  const isEdit = slot != null;
  const createSlot = useCreateTimetableSlot();
  const updateSlot = useUpdateTimetableSlot();
  const mutation = isEdit ? updateSlot : createSlot;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TimetableSlotFormInput>({
    resolver: zodResolver(timetableSlotFormSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (open) {
      reset(slot ? { subjectId: slot.subjectId } : BLANK);
    }
  }, [open, slot, reset]);

  const onSubmit = handleSubmit((values) => {
    const chosen = subjectTeachers.find((entry) => entry.subjectId === values.subjectId);
    if (!chosen) return;

    if (isEdit && slot) {
      updateSlot.mutate(
        { id: slot.id, input: { subjectId: chosen.subjectId, teacherUserId: chosen.teacherUserId } },
        { onSuccess: () => onClose() },
      );
    } else {
      createSlot.mutate(
        { classArmId, sessionId, dayOfWeek, periodId, subjectId: chosen.subjectId, teacherUserId: chosen.teacherUserId },
        { onSuccess: () => onClose() },
      );
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit slot" : "Assign slot"}>
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">{isEdit ? "Edit slot" : "Assign slot"}</h2>
        <p className="text-sm text-muted">
          {WEEKDAY_LABELS[dayOfWeek]} · {periodName}
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slot-subject">Subject</Label>
          <Select id="slot-subject" {...register("subjectId")}>
            <option value="">Select a subject…</option>
            {subjectTeachers.map((entry) => (
              <option key={entry.subjectId} value={entry.subjectId}>
                {entry.subjectName} — {entry.teacherFirstName} {entry.teacherLastName}
              </option>
            ))}
          </Select>
          <FieldError message={errors.subjectId?.message} />
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
            {isEdit ? "Save" : "Assign"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
