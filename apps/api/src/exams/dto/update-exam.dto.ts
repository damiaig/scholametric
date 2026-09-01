import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// Name only — the one field Exam has. Optional at the DTO level like
// UpdateEvaluationDto's fields, but since it's the ONLY field,
// ExamsService 400s if it's entirely absent (equivalent to
// UpdateEvaluationDto's "at least one of name or description" rule,
// just with one candidate instead of two).
export class UpdateExamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
}
