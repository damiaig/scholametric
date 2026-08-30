import { IsBoolean, IsNumber, IsOptional, IsUUID, Max, Min, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, Validate } from "class-validator";

// Belt-and-suspenders alongside exam_scores' own DB CHECK
// (exam_scores_raw_score_or_absent_check): a score is either a number or
// an absence, never both. Mirrors EvaluationScoreItemDto's own constraint
// (kept as a separate class per this codebase's one-DTO-per-endpoint
// convention, see UnpublishGradesDto's own doc comment).
@ValidatorConstraint({ name: "examRawScoreConsistentWithAbsence", async: false })
class ExamRawScoreConsistentWithAbsenceConstraint implements ValidatorConstraintInterface {
  validate(rawScore: unknown, args: ValidationArguments): boolean {
    const obj = args.object as ExamScoreItemDto;
    const hasRawScore = rawScore !== null && rawScore !== undefined;
    return !(hasRawScore && obj.isAbsent === true);
  }

  defaultMessage(): string {
    return "rawScore and isAbsent cannot both be set for the same score.";
  }
}

// Native /100 (SPEC_V0.7.md Q1), same as evaluations — no per-exam maxScore.
export class ExamScoreItemDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @Validate(ExamRawScoreConsistentWithAbsenceConstraint)
  rawScore?: number | null;

  @IsOptional()
  @IsBoolean()
  isAbsent?: boolean;
}
