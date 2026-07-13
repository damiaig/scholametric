import type { FieldErrors, FieldValues, Path, UseFormRegister } from "react-hook-form";
import type { Gender } from "@scholametric/shared";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { FieldError } from "../../components/FieldError";
import { FormSection } from "../../components/FormSection";

// Generic over any form-values type with at least these fields, so the same
// component renders inside both the create form (CreateStudentInput, fields
// required) and the edit dialog (UpdateStudentInput, fields all optional via
// .partial()) with zero duplication — so every field here is optional too,
// the loosest shape both satisfy.
export interface BioFieldsShape {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  gender?: Gender;
  dateOfBirth?: string;
}

interface StudentBioFieldsProps<T extends FieldValues & BioFieldsShape> {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
}

const TODAY = new Date().toISOString().slice(0, 10);

export function StudentBioFields<T extends FieldValues & BioFieldsShape>({
  register,
  errors,
}: StudentBioFieldsProps<T>) {
  return (
    <FormSection title="Bio">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" {...register("firstName" as Path<T>)} />
          <FieldError message={errors.firstName?.message as string | undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" {...register("lastName" as Path<T>)} />
          <FieldError message={errors.lastName?.message as string | undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="middleName">Middle name (optional)</Label>
          <Input id="middleName" {...register("middleName" as Path<T>)} />
          <FieldError message={errors.middleName?.message as string | undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gender">Gender</Label>
          <Select id="gender" {...register("gender" as Path<T>)} defaultValue="">
            <option value="" disabled>
              Select gender…
            </option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </Select>
          <FieldError message={errors.gender?.message as string | undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input id="dateOfBirth" type="date" max={TODAY} {...register("dateOfBirth" as Path<T>)} />
          <FieldError message={errors.dateOfBirth?.message as string | undefined} />
        </div>
      </div>
    </FormSection>
  );
}
