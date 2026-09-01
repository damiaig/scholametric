import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { examFormSchema, type Exam, type ExamFormInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateExam, useUpdateExam } from "./use-exams";

interface ExamFormDialogProps {
  open: boolean;
  onClose: () => void;
  classArmId: string;
  subjectId: string;
  termId: string;
  /** When set, edits this exam instead of creating a new one. */
  exam?: Exam | null;
}

const BLANK: ExamFormInput = { name: "" };

// v0.7 step 3 (SPEC_V0.7.md §3) — mirrors EvaluationFormDialog exactly,
// minus the description field (Exam has none) and with `name` optional:
// leaving it blank creates/keeps an exam whose display name defaults to
// "Exam" server-side (ExamsService.toExamResponse).
export function ExamFormDialog({ open, onClose, classArmId, subjectId, termId, exam }: ExamFormDialogProps) {
  const isEdit = exam != null;
  const createExam = useCreateExam();
  const updateExam = useUpdateExam();
  const mutation = isEdit ? updateExam : createExam;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExamFormInput>({
    resolver: zodResolver(examFormSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (open) {
      reset(exam ? { name: exam.name } : BLANK);
    }
  }, [open, exam, reset]);

  const onSubmit = handleSubmit((values) => {
    if (isEdit && exam) {
      updateExam.mutate({ id: exam.id, input: values }, { onSuccess: () => onClose() });
    } else {
      createExam.mutate({ ...values, classArmId, subjectId, termId }, { onSuccess: () => onClose() });
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit exam" : "New exam"}>
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">{isEdit ? "Edit exam" : "New exam"}</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exam-name">Name (optional)</Label>
          <Input id="exam-name" placeholder="Exam" {...register("name")} />
          <FieldError message={errors.name?.message} />
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
