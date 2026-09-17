import { IsOptional, IsUUID } from "class-validator";

// Day/period/classArm/session are fixed at creation — not re-scopable,
// same convention as evaluations' classArmId/subjectId/termId. "Moving"
// a slot in the builder UI is a delete-then-create of a different grid
// cell, not a PATCH.
export class UpdateTimetableSlotDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  teacherUserId?: string;
}
