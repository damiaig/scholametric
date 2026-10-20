import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// classArmId/subjectId are immutable (re-scoping isn't a "fix a typo"
// edit — same reasoning as UpdateHomeworkDto/UpdateEvaluationDto). All
// fields optional at the DTO level so a caller can send just one;
// LessonService 400s if none are present at all.
export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsDateString()
  lessonDate?: string;
}
