import { IsOptional, IsString, IsUUID, Length } from "class-validator";

// v0.8 step 4 (SPEC_V0.8.md §4) — a proprietor/admin's replacement for an
// already-CANCELLED (or previously REPLACED) exception. All three fields
// optional AND independently nullable: omitting a field leaves it
// unchanged, sending it as `null` explicitly clears it. Sending all three
// as null (or omitting all three when none were ever set) reverts the
// exception back to CANCELLED_TEACHER_ABSENT — there is no DELETE endpoint
// for this reason (CalendarService.replaceTimetableException).
export class ReplaceTimetableExceptionDto {
  @IsOptional()
  @IsUUID()
  replacementTeacherUserId?: string | null;

  @IsOptional()
  @IsUUID()
  replacementSubjectId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  activityLabel?: string | null;
}
