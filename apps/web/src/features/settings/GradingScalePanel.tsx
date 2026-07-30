import { useEffect, useState } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  gradeBoundaryItemSchema,
  validateGradeBoundariesSet,
  GRADE_BOUNDARIES_MIN,
  GRADE_BOUNDARIES_MAX,
  type GradeBoundary,
  type GradeBoundaryItemInput,
  type GradingPresetRow,
} from "@scholametric/shared";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { FieldError } from "../../components/FieldError";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { cn } from "../../lib/utils";
import { useGradeBoundaries, useGradingPresets, useReplaceGradeBoundaries } from "./use-grade-boundaries";

const formSchema = z.object({
  boundaries: z
    .array(gradeBoundaryItemSchema)
    .min(GRADE_BOUNDARIES_MIN, `At least ${GRADE_BOUNDARIES_MIN} grade boundaries are required.`)
    .max(GRADE_BOUNDARIES_MAX, `At most ${GRADE_BOUNDARIES_MAX} grade boundaries are allowed.`),
});
type FormValues = z.infer<typeof formSchema>;

function toFormValues(items: GradeBoundary[]): FormValues {
  return {
    boundaries: items.map((item) => ({
      grade: item.grade,
      minScore: item.minScore,
      maxScore: item.maxScore,
      remark: item.remark,
      sortOrder: item.sortOrder,
    })),
  };
}

function presetToRows(preset: GradingPresetRow[]): GradeBoundaryItemInput[] {
  return preset.map((row) => ({
    grade: row.grade,
    minScore: row.minScore,
    maxScore: row.maxScore,
    remark: row.remark,
    sortOrder: row.sortOrder,
  }));
}

type PresetKey = "waec9Point" | "simpleAToF";
const PRESET_LABELS: Record<PresetKey, string> = { waec9Point: "WAEC 9-point", simpleAToF: "A-F" };

export function GradingScalePanel() {
  const query = useGradeBoundaries();
  const presetsQuery = useGradingPresets();
  const replaceMutation = useReplaceGradeBoundaries();
  const [confirmingPreset, setConfirmingPreset] = useState<PresetKey | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { boundaries: [] },
  });
  const { fields, append, remove, replace: replaceRows } = useFieldArray({ control, name: "boundaries" });
  const watchedBoundaries = useWatch({ control, name: "boundaries" });

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
          <Spinner /> Loading grading scale…
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-sm text-danger">{getErrorMessage(query.error, "Couldn't load the grading scale.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const keyedRows = fields.map((field, index) => ({
    ...(watchedBoundaries?.[index] ?? { grade: "", minScore: 0, maxScore: 0, remark: "", sortOrder: 0 }),
    _key: field.id,
  }));
  const crossItem = validateGradeBoundariesSet(keyedRows, (row) => row._key);

  function addBoundary() {
    append({ grade: "", minScore: 0, maxScore: 0, remark: "", sortOrder: fields.length });
  }

  // useFieldArray's replace() (not reset()) — swaps the CURRENT values only,
  // leaving the form's original defaultValues baseline (the server-loaded
  // set) untouched. reset() would reset that baseline too, which would
  // wrongly mark the form as "not dirty" right after applying a preset
  // (hiding Save) and make "Discard changes" revert to the preset instead
  // of what was actually persisted.
  function applyPreset(preset: PresetKey) {
    const rows = presetsQuery.data?.[preset];
    if (!rows) return;
    replaceRows(presetToRows(rows));
  }

  const onSubmit = handleSubmit((values) => {
    // Belt-and-braces: the Save button below is already disabled whenever
    // crossItem is invalid, but this guards Enter-key submission too. Only
    // .isValid is read here, so the keyOf callback's return value is moot.
    if (!validateGradeBoundariesSet(values.boundaries, () => "").isValid) return;
    replaceMutation.mutate(values.boundaries, { onSuccess: (data) => reset(toFormValues(data)) });
  });

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text">Grading scale</h2>
            <p className="mt-1 text-sm text-muted">
              Grade boundaries must tile 0-100 with no gaps or overlaps.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!presetsQuery.data}
              onClick={() => setConfirmingPreset("waec9Point")}
            >
              Apply WAEC 9-point
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!presetsQuery.data}
              onClick={() => setConfirmingPreset("simpleAToF")}
            >
              Apply A-F
            </Button>
          </div>
        </div>

        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-3">
            {fields.map((field, index) => {
              const isInvalid = crossItem.invalidKeys.has(field.id);
              return (
                <div
                  key={field.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:flex-wrap",
                    isInvalid ? "border-danger bg-danger/5" : "border-muted/20",
                  )}
                >
                  <div className="flex w-full flex-col gap-1.5 sm:w-24">
                    <Label htmlFor={`boundary-${index}-grade`}>Grade</Label>
                    <Input id={`boundary-${index}-grade`} {...register(`boundaries.${index}.grade`)} />
                    <FieldError message={errors.boundaries?.[index]?.grade?.message} />
                  </div>
                  <div className="flex w-full flex-col gap-1.5 sm:w-24">
                    <Label htmlFor={`boundary-${index}-min`}>Min</Label>
                    <Input
                      id={`boundary-${index}-min`}
                      type="number"
                      inputMode="numeric"
                      {...register(`boundaries.${index}.minScore`, { valueAsNumber: true })}
                    />
                    <FieldError message={errors.boundaries?.[index]?.minScore?.message} />
                  </div>
                  <div className="flex w-full flex-col gap-1.5 sm:w-24">
                    <Label htmlFor={`boundary-${index}-max`}>Max</Label>
                    <Input
                      id={`boundary-${index}-max`}
                      type="number"
                      inputMode="numeric"
                      {...register(`boundaries.${index}.maxScore`, { valueAsNumber: true })}
                    />
                    <FieldError message={errors.boundaries?.[index]?.maxScore?.message} />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor={`boundary-${index}-remark`}>Remark</Label>
                    <Input id={`boundary-${index}-remark`} {...register(`boundaries.${index}.remark`)} />
                    <FieldError message={errors.boundaries?.[index]?.remark?.message} />
                  </div>
                  <div className="flex w-full flex-col gap-1.5 sm:w-24">
                    <Label htmlFor={`boundary-${index}-sort-order`}>Order</Label>
                    <Input
                      id={`boundary-${index}-sort-order`}
                      type="number"
                      inputMode="numeric"
                      {...register(`boundaries.${index}.sortOrder`, { valueAsNumber: true })}
                    />
                    <FieldError message={errors.boundaries?.[index]?.sortOrder?.message} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Remove ${watchedBoundaries?.[index]?.grade || "grade boundary"}`}
                    className="mt-1 shrink-0 text-danger hover:bg-danger/10 sm:mt-6"
                    onClick={() => remove(index)}
                    disabled={fields.length <= GRADE_BOUNDARIES_MIN}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              );
            })}
          </div>

          {typeof errors.boundaries?.message === "string" && <FieldError message={errors.boundaries.message} />}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={addBoundary}
            disabled={fields.length >= GRADE_BOUNDARIES_MAX}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add grade boundary
          </Button>

          {!crossItem.isValid && crossItem.error && (
            <p role="alert" className="text-sm text-danger">
              {crossItem.error}
            </p>
          )}

          {replaceMutation.isError && (
            <p role="alert" className="text-sm text-danger">
              {getErrorMessage(replaceMutation.error)}
            </p>
          )}
          {replaceMutation.isSuccess && !isDirty && (
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
            <Button type="submit" disabled={!isDirty || !crossItem.isValid || replaceMutation.isPending}>
              {replaceMutation.isPending && <Spinner className="mr-2" />}
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>

      <ConfirmDialog
        open={confirmingPreset !== null}
        onClose={() => setConfirmingPreset(null)}
        onConfirm={() => {
          if (confirmingPreset) applyPreset(confirmingPreset);
          setConfirmingPreset(null);
        }}
        title="Replace grading scale"
        description={`This replaces your current grading scale with the ${
          confirmingPreset ? PRESET_LABELS[confirmingPreset] : ""
        } preset. You'll still need to save to persist it.`}
        confirmLabel="Apply preset"
      />
    </Card>
  );
}
