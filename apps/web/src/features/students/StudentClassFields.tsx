import type { FieldErrors, FieldValues, Path, UseFormRegister } from "react-hook-form";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { FormSection } from "../../components/FormSection";
import { ClassArmSelect } from "./ClassArmSelect";

export interface ClassFieldsShape {
  classArmId: string;
  admissionNumber?: string;
}

interface StudentClassFieldsProps<T extends FieldValues & ClassFieldsShape> {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
}

// Create-only — editing a student's class goes through the separate
// transfer-class action, and admissionNumber is immutable after creation.
export function StudentClassFields<T extends FieldValues & ClassFieldsShape>({
  register,
  errors,
}: StudentClassFieldsProps<T>) {
  return (
    <FormSection title="Class" description="Which class arm is this student joining?">
      <ClassArmSelect
        register={register}
        name={"classArmId" as Path<T>}
        error={errors.classArmId?.message as string | undefined}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="admissionNumber">Admission number (optional)</Label>
        <Input
          id="admissionNumber"
          placeholder="Auto-generated if left blank"
          {...register("admissionNumber" as Path<T>)}
        />
        <FieldError message={errors.admissionNumber?.message as string | undefined} />
      </div>
    </FormSection>
  );
}
