import { BadRequestException } from "@nestjs/common";
import { IsDateString } from "class-validator";

// v0.8 step 3 (SPEC_V0.8.md §7 item 3) — the on-read composition's date
// window. Both required (no implicit "this week" default server-side —
// same explicit-not-implicit convention as every other date-scoping param
// in this codebase). Order/range are checked in the service, not here
// (class-validator has no built-in cross-field comparison), mirroring
// CalendarService.assertDateOrder's existing shape for holidays.
export class GetTimetableRangeDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export const MAX_TIMETABLE_RANGE_DAYS = 31;

export function assertTimetableRangeValid(from: string, to: string): void {
  if (from > to) {
    throw new BadRequestException("`from` must be on or before `to`.");
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_TIMETABLE_RANGE_DAYS) {
    throw new BadRequestException(`The date range can't exceed ${MAX_TIMETABLE_RANGE_DAYS} days.`);
  }
}
