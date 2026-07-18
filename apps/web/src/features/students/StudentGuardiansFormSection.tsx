import {
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import {
  GUARDIAN_RELATIONSHIPS,
  GUARDIAN_RELATIONSHIP_LABELS,
  type CreateStudentInput,
} from "@scholametric/shared";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { FieldError } from "../../components/FieldError";
import { FormSection } from "../../components/FormSection";
import { SiblingGuardianPicker } from "./guardians/SiblingGuardianPicker";

interface StudentGuardiansFormSectionProps {
  control: Control<CreateStudentInput>;
  register: UseFormRegister<CreateStudentInput>;
  setValue: UseFormSetValue<CreateStudentInput>;
  errors: FieldErrors<CreateStudentInput>;
}

const EMPTY_GUARDIAN: CreateStudentInput["guardians"][number] = {
  mode: "new",
  relationship: undefined as never,
  isPrimary: false,
};

// 1..n guardians, first defaults primary (SPEC_V0.2.md §4) — "primary" is
// modeled as one shared radio group across the array rather than a
// per-entry checkbox, so exactly one is always selected once there's at
// least one entry.
export function StudentGuardiansFormSection({ control, register, setValue, errors }: StudentGuardiansFormSectionProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "guardians" });
  const watchedGuardians = useWatch({ control, name: "guardians" });

  function makePrimary(index: number) {
    fields.forEach((_, otherIndex) => {
      setValue(`guardians.${otherIndex}.isPrimary`, otherIndex === index, { shouldDirty: true });
    });
  }

  function addGuardian() {
    append({ ...EMPTY_GUARDIAN, isPrimary: fields.length === 0 });
  }

  const guardianErrors = errors.guardians;

  return (
    <FormSection title="Guardians" description="At least one guardian is required. The first is primary by default.">
      <div className="flex flex-col gap-4">
        {fields.map((field, index) => {
          const mode = watchedGuardians?.[index]?.mode ?? "new";
          const isPrimary = watchedGuardians?.[index]?.isPrimary ?? false;
          const guardianId = watchedGuardians?.[index]?.guardianId;
          const entryErrors = Array.isArray(guardianErrors) ? guardianErrors[index] : undefined;

          return (
            <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-muted/20 p-4">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-text">
                  <input
                    type="radio"
                    name="primary-guardian"
                    checked={isPrimary}
                    onChange={() => makePrimary(index)}
                    className="h-4 w-4 border-muted text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  Primary guardian
                </label>
                {fields.length > 1 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => remove(index)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>

              <div className="flex gap-1 rounded-md border border-muted/30 p-1">
                <button
                  type="button"
                  onClick={() => setValue(`guardians.${index}.mode`, "new")}
                  className={
                    mode === "new"
                      ? "flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white"
                      : "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-background"
                  }
                >
                  Create new
                </button>
                <button
                  type="button"
                  onClick={() => setValue(`guardians.${index}.mode`, "existing")}
                  className={
                    mode === "existing"
                      ? "flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white"
                      : "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-background"
                  }
                >
                  Link existing (sibling)
                </button>
              </div>

              {mode === "new" ? (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`guardian-${index}-first-name`}>First name</Label>
                      <Input id={`guardian-${index}-first-name`} {...register(`guardians.${index}.firstName`)} />
                      <FieldError message={entryErrors?.firstName?.message as string | undefined} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`guardian-${index}-last-name`}>Last name</Label>
                      <Input id={`guardian-${index}-last-name`} {...register(`guardians.${index}.lastName`)} />
                      <FieldError message={entryErrors?.lastName?.message as string | undefined} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`guardian-${index}-phone`}>Phone</Label>
                    <Input id={`guardian-${index}-phone`} {...register(`guardians.${index}.phone`)} />
                    <FieldError message={entryErrors?.phone?.message as string | undefined} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`guardian-${index}-email`}>Email (optional)</Label>
                    <Input id={`guardian-${index}-email`} type="email" {...register(`guardians.${index}.email`)} />
                    <FieldError message={entryErrors?.email?.message as string | undefined} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`guardian-${index}-address`}>Address (optional)</Label>
                    <Input id={`guardian-${index}-address`} {...register(`guardians.${index}.address`)} />
                  </div>
                </>
              ) : (
                <>
                  <SiblingGuardianPicker
                    selectedGuardianId={guardianId}
                    onSelect={(id) => setValue(`guardians.${index}.guardianId`, id, { shouldValidate: true })}
                  />
                  <FieldError message={entryErrors?.guardianId?.message as string | undefined} />
                </>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`guardian-${index}-relationship`}>Relationship to student</Label>
                <Select
                  id={`guardian-${index}-relationship`}
                  defaultValue=""
                  {...register(`guardians.${index}.relationship`)}
                >
                  <option value="" disabled>
                    Select a relationship…
                  </option>
                  {GUARDIAN_RELATIONSHIPS.map((value) => (
                    <option key={value} value={value}>
                      {GUARDIAN_RELATIONSHIP_LABELS[value]}
                    </option>
                  ))}
                </Select>
                <FieldError message={entryErrors?.relationship?.message as string | undefined} />
              </div>
            </div>
          );
        })}

        {typeof guardianErrors?.message === "string" && <FieldError message={guardianErrors.message} />}

        <Button type="button" variant="outline" size="sm" className="self-start" onClick={addGuardian}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add another guardian
        </Button>
      </div>
    </FormSection>
  );
}
