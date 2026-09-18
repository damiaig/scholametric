import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { replaceTimetableExceptionSchema, type ReplaceTimetableExceptionInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useTeachers } from "../teachers/use-teachers";
import { useAllSubjects } from "../classes/use-subjects";
import { useReplaceTimetableException } from "./use-teacher-absences";

interface ReplacementFormDialogProps {
  open: boolean;
  onClose: () => void;
  exceptionId: string;
  periodLabel: string;
  isReplaced: boolean;
}

const MAX_TEACHERS_FOR_PICKER = 100;

// A native <select>/text input can't hold `null` directly — "" stands in
// for "not set" while editing, and is translated to null only at submit
// time (replaceTimetableExceptionSchema's own fields are all nullable).
const formSchema = z.object({
  replacementTeacherUserId: z.string(),
  replacementSubjectId: z.string(),
  activityLabel: z.string().trim().max(200, "Keep it under 200 characters"),
});
type FormValues = z.infer<typeof formSchema>;

const BLANK: FormValues = { replacementTeacherUserId: "", replacementSubjectId: "", activityLabel: "" };

// v0.8 step 4 (SPEC_V0.8.md §4) — a proprietor/admin replaces a cancelled
// period with a covering teacher and/or a different subject/activity.
// "Revert to cancelled" sends all three fields as null — there is no
// DELETE endpoint (CalendarService.replaceTimetableException).
export function ReplacementFormDialog({ open, onClose, exceptionId, periodLabel, isReplaced }: ReplacementFormDialogProps) {
  const teachersQuery = useTeachers({ page: 1, pageSize: MAX_TEACHERS_FOR_PICKER, search: "" });
  const subjectsQuery = useAllSubjects();
  const replaceException = useReplaceTimetableException();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: BLANK });

  useEffect(() => {
    if (open) {
      reset(BLANK);
    }
  }, [open, reset]);

  function submitInput(input: ReplaceTimetableExceptionInput) {
    const parsed = replaceTimetableExceptionSchema.safeParse(input);
    if (!parsed.success) return;
    replaceException.mutate(
      { id: exceptionId, input: parsed.data },
      { onSuccess: () => { reset(BLANK); onClose(); } },
    );
  }

  const onSubmit = handleSubmit((values) =>
    submitInput({
      replacementTeacherUserId: values.replacementTeacherUserId || null,
      replacementSubjectId: values.replacementSubjectId || null,
      activityLabel: values.activityLabel.trim() || null,
    }),
  );

  function handleRevert() {
    submitInput({ replacementTeacherUserId: null, replacementSubjectId: null, activityLabel: null });
  }

  const teachers = teachersQuery.data?.items ?? [];
  const subjects = subjectsQuery.data ?? [];

  return (
    <Dialog open={open} onClose={onClose} title="Replace cancelled period">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Replace cancelled period</h2>
        <p className="text-sm text-muted">{periodLabel}</p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="replacement-teacher">Replacement teacher</Label>
          <Select id="replacement-teacher" {...register("replacementTeacherUserId")}>
            <option value="">No replacement teacher</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.firstName} {teacher.lastName}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="replacement-subject">Replacement subject</Label>
          <Select id="replacement-subject" {...register("replacementSubjectId")}>
            <option value="">No replacement subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="replacement-activity">Activity label</Label>
          <Input id="replacement-activity" placeholder="e.g. Prep/Study period" {...register("activityLabel")} />
          <FieldError message={errors.activityLabel?.message} />
        </div>

        {replaceException.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(replaceException.error)}
          </p>
        )}

        <div className="flex justify-between gap-2">
          {isReplaced ? (
            <Button type="button" variant="outline" onClick={handleRevert} disabled={replaceException.isPending}>
              Revert to cancelled
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={replaceException.isPending}>
              {replaceException.isPending && <Spinner className="mr-2" />}
              Save
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
