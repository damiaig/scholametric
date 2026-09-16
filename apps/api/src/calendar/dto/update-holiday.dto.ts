import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

// sessionId is fixed at creation — not re-scopable, same convention as
// evaluations' classArmId/subjectId/termId.
export class UpdateHolidayDto {
  @IsOptional()
  @IsUUID()
  termId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
