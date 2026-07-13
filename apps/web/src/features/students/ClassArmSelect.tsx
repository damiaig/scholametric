import type { FieldValues, Path, UseFormRegister } from "react-hook-form";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { FieldError } from "../../components/FieldError";
import { useClassLevels } from "./use-class-levels";
import { useClassArms } from "./use-class-arms";
import { buildClassArmOptions } from "./class-arm-options";

interface ClassArmSelectProps<T extends FieldValues> {
  register: UseFormRegister<T>;
  name: Path<T>;
  error?: string;
  label?: string;
}

// The one reused atom between the create form's class section and the
// standalone transfer-class dialog — both need exactly "pick a class arm",
// nothing else.
export function ClassArmSelect<T extends FieldValues>({
  register,
  name,
  error,
  label = "Class",
}: ClassArmSelectProps<T>) {
  const classLevels = useClassLevels();
  const classArms = useClassArms();
  const isLoading = classLevels.isLoading || classArms.isLoading;
  const options = classLevels.data && classArms.data ? buildClassArmOptions(classLevels.data, classArms.data) : [];

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Select id={name} disabled={isLoading} defaultValue="" {...register(name)}>
        <option value="" disabled>
          {isLoading ? "Loading classes…" : "Select a class…"}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <FieldError message={error} />
    </div>
  );
}
