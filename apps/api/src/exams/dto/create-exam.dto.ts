import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

// v0.7 step 3 (SPEC_V0.7.md §2/§3): an exam — unlike Evaluation, `name` is
// OPTIONAL (schema: nullable, defaults to "Exam" for display — see
// ExamsService.toExamResponse) and there is no `description` field at
// all. classArmId/subjectId/termId are immutable once created, same as
// CreateEvaluationDto — re-scoping isn't a "fix a typo" edit.
export class CreateExamDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
}
