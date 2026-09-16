import { IsBoolean } from "class-validator";

// The only knob: Mon-Fri is implicit/fixed, Sunday has no field at all —
// there is no weekday-set or bitmask input to smuggle Sunday through.
export class SetClassSchoolDaysDto {
  @IsBoolean()
  includesSaturday!: boolean;
}
