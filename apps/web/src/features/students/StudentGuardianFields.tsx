import type { FieldErrors, FieldValues, Path, UseFormRegister } from "react-hook-form";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { FormSection } from "../../components/FormSection";

// All optional — this shape must satisfy both CreateStudentInput (required
// fields) and UpdateStudentInput (all fields optional via .partial()).
export interface GuardianFieldsShape {
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  address?: string;
}

interface StudentGuardianFieldsProps<T extends FieldValues & GuardianFieldsShape> {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
}

export function StudentGuardianFields<T extends FieldValues & GuardianFieldsShape>({
  register,
  errors,
}: StudentGuardianFieldsProps<T>) {
  return (
    <FormSection title="Guardian">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guardianName">Guardian name</Label>
          <Input id="guardianName" {...register("guardianName" as Path<T>)} />
          <FieldError message={errors.guardianName?.message as string | undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guardianPhone">Guardian phone</Label>
          <Input id="guardianPhone" {...register("guardianPhone" as Path<T>)} />
          <FieldError message={errors.guardianPhone?.message as string | undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guardianEmail">Guardian email (optional)</Label>
          <Input id="guardianEmail" type="email" {...register("guardianEmail" as Path<T>)} />
          <FieldError message={errors.guardianEmail?.message as string | undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Address (optional)</Label>
          <Input id="address" {...register("address" as Path<T>)} />
          <FieldError message={errors.address?.message as string | undefined} />
        </div>
      </div>
    </FormSection>
  );
}
