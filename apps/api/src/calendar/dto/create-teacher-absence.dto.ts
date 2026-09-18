import { ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsString, IsUUID, Length } from "class-validator";

// v0.8 step 4 (SPEC_V0.8.md §4) — a teacher marking themselves absent for
// one or more periods on one date. No classArmId field — the affected
// class is always resolved server-side from the caller's own
// TimetableSlot for (date's weekday, periodId), which is what makes
// "cancel a colleague's class" structurally impossible rather than merely
// forbidden (there is no field to name their class with).
export class CreateTeacherAbsenceDto {
  @IsDateString()
  date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  periodIds!: string[];

  @IsString()
  @Length(1, 500)
  note!: string;
}
