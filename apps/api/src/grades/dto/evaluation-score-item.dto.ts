import { IsBoolean, IsNumber, IsOptional, IsUUID, Max, Min, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, Validate } from "class-validator";

// Belt-and-suspenders alongside evaluation_scores' own DB CHECK
// (evaluation_scores_raw_score_or_absent_check): a score is either a
// number or an absence, never both. The DB CHECK is the last-resort
// guarantee; this is the first-line 400 so a malformed payload never
// reaches the database at all.
@ValidatorConstraint({ name: "rawScoreConsistentWithAbsence", async: false })
class RawScoreConsistentWithAbsenceConstraint implements ValidatorConstraintInterface {
  validate(rawScore: unknown, args: ValidationArguments): boolean {
    const obj = args.object as EvaluationScoreItemDto;
    const hasRawScore = rawScore !== null && rawScore !== undefined;
    return !(hasRawScore && obj.isAbsent === true);
  }

  defaultMessage(): string {
    return "rawScore and isAbsent cannot both be set for the same score.";
  }
}

// Unlike the old GridScoreItemDto (dynamic per-component max_score),
// evaluations are always scored natively /100 (SPEC_V0.7.md Q1) — the
// ceiling is static, so it's validated right here rather than only in
// the service.
export class EvaluationScoreItemDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @Validate(RawScoreConsistentWithAbsenceConstraint)
  rawScore?: number | null;

  @IsOptional()
  @IsBoolean()
  isAbsent?: boolean;
}
