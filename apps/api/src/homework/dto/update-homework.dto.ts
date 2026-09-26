import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// classArmId/subjectId/termId are immutable (re-scoping isn't a "fix a
// typo" edit — same reasoning as UpdateEvaluationDto). All fields
// optional at the DTO level so a caller can send just one; HomeworkService
// 400s if none are present at all.
export class UpdateHomeworkDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  requiresUpload?: boolean;
}
