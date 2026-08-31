import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { evaluationFormSchema, type Evaluation, type EvaluationFormInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateEvaluation, useUpdateEvaluation } from "./use-evaluations";

interface EvaluationFormDialogProps {
  open: boolean;
  onClose: () => void;
  classArmId: string;
  subjectId: string;
  termId: string;
  /** When set, edits this evaluation instead of creating a new one. */
  evaluation?: Evaluation | null;
}

const BLANK: EvaluationFormInput = { name: "", description: "" };

// v0.7 step 2 (SPEC_V0.7.md §3) — create/edit share one form (both fields
// required either way, same evaluationFormSchema), the mode is inferred
// from whether `evaluation` is passed, same "one dialog, context decides
// the verb" shape as CreateTermDialog's create-only precedent, extended
// to also handle edit here since the two modes differ only in which
// mutation fires and whether the fields start blank or prefilled.
export function EvaluationFormDialog({ open, onClose, classArmId, subjectId, termId, evaluation }: EvaluationFormDialogProps) {
  const isEdit = evaluation != null;
  const createEvaluation = useCreateEvaluation();
  const updateEvaluation = useUpdateEvaluation();
  const mutation = isEdit ? updateEvaluation : createEvaluation;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EvaluationFormInput>({
    resolver: zodResolver(evaluationFormSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (open) {
      reset(evaluation ? { name: evaluation.name, description: evaluation.description } : BLANK);
    }
  }, [open, evaluation, reset]);

  const onSubmit = handleSubmit((values) => {
    if (isEdit && evaluation) {
      updateEvaluation.mutate({ id: evaluation.id, input: values }, { onSuccess: () => onClose() });
    } else {
      createEvaluation.mutate({ ...values, classArmId, subjectId, termId }, { onSuccess: () => onClose() });
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit evaluation" : "New evaluation"}>
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">{isEdit ? "Edit evaluation" : "New evaluation"}</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="evaluation-name">Name</Label>
          <Input id="evaluation-name" placeholder="e.g. Mid-term Test" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="evaluation-description">Description</Label>
          <Textarea id="evaluation-description" placeholder="What this evaluation covers" {...register("description")} />
          <FieldError message={errors.description?.message} />
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
