import { IsEnum, IsUUID } from "class-validator";
import { Weekday } from "@prisma/client";

// @IsEnum(Weekday) is the structural Sunday block: Weekday has no SUNDAY
// member, so this 400s "SUNDAY" (or anything else) before the service
// layer ever runs — there is no bypass, not even a raw Prisma write.
export class CreateTimetableSlotDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  sessionId!: string;

  @IsEnum(Weekday)
  dayOfWeek!: Weekday;

  @IsUUID()
  periodId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  teacherUserId!: string;
}
