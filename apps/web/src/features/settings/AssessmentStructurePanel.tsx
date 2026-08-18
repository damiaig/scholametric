import { useEffect } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  assessmentComponentItemSchema,
  validateAssessmentComponentsSet,
  ASSESSMENT_COMPONENTS_MIN,
  ASSESSMENT_COMPONENTS_MAX,
  type AssessmentComponent,
} from "@scholametric/shared";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { FieldError } from "../../components/FieldError";
import { getErrorMessage } from "../../lib/api-client";
import { cn } from "../../lib/utils";
import { useAssessmentComponents, useReplaceAssessmentComponents } from "./use-assessment-components";

const formSchema = z.object({
  components: z
    .array(assessmentComponentItemSchema)
    .min(ASSESSMENT_COMPONENTS_MIN, `At least ${ASSESSMENT_COMPONENTS_MIN} component is required.`)
    .max(ASSESSMENT_COMPONENTS_MAX, `At most ${ASSESSMENT_COMPONENTS_MAX} components are allowed.`),
});
type FormValues = z.infer<typeof formSchema>;

// v0.5 acceptance-walk fix: this used to drop requiresApproval entirely,
// so every save round-tripped it as omitted -> defaulted false server-side
// for EVERY component, tripping the zero-approval-component rejection on
// every single save (not just a deliberate bad one). See docs/DECISIONS.md.
function toFormValues(items: AssessmentComponent[]): FormValues {
  return {
    components: items.map((item) => ({
      name: item.name,
      weight: item.weight,
      sortOrder: item.sortOrder,
      requiresApproval: item.requiresApproval,
    })),
  };
}

export function AssessmentStructurePanel() {
  const query = useAssessmentComponents();
  const replace = useReplaceAssessmentComponents();

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { components: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "components" });
  const watchedComponents = useWatch({ control, name: "components" });

  useEffect(() => {
    if (query.data) {
      reset(toFormValues(query.data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted">
          <Spinner /> Loading assessment structure…
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-sm text-danger">{getErrorMessage(query.error, "Couldn't load assessment components.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const crossItem = validateAssessmentComponentsSet(watchedComponents ?? []);

  function addComponent() {
    // requiresApproval defaults false for a newly-added component — a new
    // row isn't automatically the exam; the admin opts it in explicitly.
    append({ name: "", weight: 1, sortOrder: fields.length, requiresApproval: false });
  }

  const onSubmit = handleSubmit((values) => {
    // Belt-and-braces: the Save button below is already disabled whenever
    // crossItem is invalid, but this guards Enter-key submission too.
    if (!validateAssessmentComponentsSet(values.components).isValid) return;
    replace.mutate(values.components, { onSuccess: (data) => reset(toFormValues(data)) });
  });

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-text">Assessment structure</h2>
          <p className="mt-1 text-sm text-muted">
            The components that make up a student&apos;s total score for a subject (e.g. CA1, CA2, Exam). Weights
            must sum to exactly 100.
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-2 rounded-lg border border-muted/20 p-3 sm:flex-row sm:items-start">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor={`component-${index}-name`}>Name</Label>
                  <Input id={`component-${index}-name`} {...register(`components.${index}.name`)} />
                  <FieldError message={errors.components?.[index]?.name?.message} />
                </div>
                <div className="flex w-full flex-col gap-1.5 sm:w-28">
                  <Label htmlFor={`component-${index}-weight`}>Weight</Label>
                  <Input
                    id={`component-${index}-weight`}
                    type="number"
                    inputMode="numeric"
                    {...register(`components.${index}.weight`, { valueAsNumber: true })}
                  />
                  <FieldError message={errors.components?.[index]?.weight?.message} />
                </div>
                <div className="flex w-full flex-col gap-1.5 sm:w-28">
                  <Label htmlFor={`component-${index}-sort-order`}>Sort order</Label>
                  <Input
                    id={`component-${index}-sort-order`}
                    type="number"
                    inputMode="numeric"
                    {...register(`components.${index}.sortOrder`, { valueAsNumber: true })}
                  />
                  <FieldError message={errors.components?.[index]?.sortOrder?.message} />
                </div>
                <div className="flex w-full flex-col gap-1.5 sm:w-44">
                  <Label htmlFor={`component-${index}-requires-approval`}>Requires approval</Label>
                  <div className="flex h-10 items-center gap-2">
                    <Checkbox id={`component-${index}-requires-approval`} {...register(`components.${index}.requiresApproval`)} />
                    <span className="text-xs text-muted">Gates publish (e.g. the exam)</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Remove ${watchedComponents?.[index]?.name || "component"}`}
                  className="mt-1 shrink-0 text-danger hover:bg-danger/10 sm:mt-6"
                  onClick={() => remove(index)}
                  disabled={fields.length <= ASSESSMENT_COMPONENTS_MIN}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          {typeof errors.components?.message === "string" && <FieldError message={errors.components.message} />}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={addComponent}
              disabled={fields.length >= ASSESSMENT_COMPONENTS_MAX}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add component
            </Button>

            <p
              className={cn(
                "text-sm font-semibold",
                crossItem.totalWeight === 100 ? "text-success" : "text-danger",
              )}
              aria-live="polite"
            >
              Total: {crossItem.totalWeight}/100
            </p>
          </div>

          {!crossItem.isValid && crossItem.error && (
            <p role="alert" className="text-sm text-danger">
              {crossItem.error}
            </p>
          )}

          {replace.isError && (
            <p role="alert" className="text-sm text-danger">
              {getErrorMessage(replace.error)}
            </p>
          )}
          {replace.isSuccess && !isDirty && (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Saved.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => query.data && reset(toFormValues(query.data))}
              disabled={!isDirty}
            >
              Discard changes
            </Button>
            <Button type="submit" disabled={!isDirty || !crossItem.isValid || replace.isPending}>
              {replace.isPending && <Spinner className="mr-2" />}
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
