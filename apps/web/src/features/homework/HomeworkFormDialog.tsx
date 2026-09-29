import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { homeworkFormSchema, type Homework, type HomeworkFormInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { StyledDatePicker } from "../../components/ui/styled-date-picker";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateHomework, useUpdateHomework } from "./use-homework";

interface HomeworkFormDialogProps {
  open: boolean;
  onClose: () => void;
  classArmId: string;
  subjectId: string;
  termId: string;
  /** When set, edits this homework instead of creating a new one. */
  homework?: Homework | null;
}

const BLANK: HomeworkFormInput = { title: "", description: "", dueDate: "", requiresUpload: false };

// v0.8.2 step 5 (SPEC_V0.8.2.md §6 item 5) — mirrors EvaluationFormDialog's
// exact create/edit shape (one dialog, mode inferred from whether
// `homework` is passed). No client-side school-day check on dueDate — the
// server (CalendarService.isSchoolDayForClassOnDate) is the sole
// authority; a rejected holiday/weekend surfaces via mutation.isError like
// any other server-side validation failure. minDate="today" is a UX
// nicety only (StyledDatePicker's own literal keyword), not enforcement —
// ruled at plan time to skip auto-defaulting to "the next school day"
// (would need calendar data fetched before the form even opens, for
// marginal gain over the teacher just picking a date).
export function HomeworkFormDialog({ open, onClose, classArmId, subjectId, termId, homework }: HomeworkFormDialogProps) {
  const isEdit = homework != null;
  const createHomework = useCreateHomework();
  const updateHomework = useUpdateHomework();
  const mutation = isEdit ? updateHomework : createHomework;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<HomeworkFormInput>({
    resolver: zodResolver(homeworkFormSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (open) {
      reset(
        homework
          ? { title: homework.title, description: homework.description, dueDate: homework.dueDate, requiresUpload: homework.requiresUpload }
          : BLANK,
      );
    }
  }, [open, homework, reset]);

  const onSubmit = handleSubmit((values) => {
    if (isEdit && homework) {
      updateHomework.mutate({ id: homework.id, input: values }, { onSuccess: () => onClose() });
    } else {
      createHomework.mutate({ ...values, classArmId, subjectId, termId }, { onSuccess: () => onClose() });
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit homework" : "New homework"}>
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">{isEdit ? "Edit homework" : "New homework"}</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="homework-title">Title</Label>
          <Input id="homework-title" placeholder="e.g. Chapter 3 exercises" {...register("title")} />
          <FieldError message={errors.title?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="homework-description">Description</Label>
          <Textarea id="homework-description" placeholder="What students need to do" {...register("description")} />
          <FieldError message={errors.description?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="homework-due-date">Due date</Label>
          <Controller
            name="dueDate"
            control={control}
            render={({ field }) => (
              <StyledDatePicker id="homework-due-date" value={field.value} onChange={field.onChange} minDate="today" placeholder="Select a date…" />
            )}
          />
          <FieldError message={errors.dueDate?.message} />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="homework-requires-upload" {...register("requiresUpload")} />
          <Label htmlFor="homework-requires-upload">Requires a file upload from students</Label>
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
