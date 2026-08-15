import { IsBoolean, IsNumber, IsOptional, IsUUID, Min, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, Validate } from "class-validator";

// Belt-and-suspenders alongside student_scores' own DB CHECK
// (student_scores_raw_score_or_absent_check, SPEC_V0.5.md §2.1 / step 1):
// a score is either a number or an absence, never both. The DB CHECK is the
// last-resort guarantee; this is the first-line 400 so a malformed payload
// never reaches the database at all.
@ValidatorConstraint({ name: "rawScoreConsistentWithAbsence", async: false })
class RawScoreConsistentWithAbsenceConstraint implements ValidatorConstraintInterface {
  validate(rawScore: unknown, args: ValidationArguments): boolean {
    const obj = args.object as GridScoreItemDto;
    const hasRawScore = rawScore !== null && rawScore !== undefined;
    return !(hasRawScore && obj.isAbsent === true);
  }

  defaultMessage(): string {
    return "rawScore and isAbsent cannot both be set for the same score.";
  }
}

// No upper bound here on purpose: the only valid ceiling is the specific
// component's max_score, which is dynamic per component and checked in
// GradesService against the actual row. A DTO-level cap (even a generous
// one) would silently false-reject a legitimate score for any component
// whose max_score exceeds that cap.
export class GridScoreItemDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Validate(RawScoreConsistentWithAbsenceConstraint)
  rawScore?: number | null;

  @IsOptional()
  @IsBoolean()
  isAbsent?: boolean;
}
