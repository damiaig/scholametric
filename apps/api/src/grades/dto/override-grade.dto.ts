import { IsString, IsUUID, MinLength, ValidateIf } from "class-validator";

// overrideGrade is required-but-nullable, not optional: the field must be
// present (either a real grade string, to set it, or literal null, to
// clear it) — omitting the key entirely is a client error, not "leave it
// alone." @IsOptional() would wrongly treat a missing key the same as an
// explicit null, so this uses @ValidateIf to allow null through untyped
// while still requiring the key to exist.
export class OverrideGradeDto {
  @IsUUID()
  termSubjectResultId!: string;

  @ValidateIf((o) => o.overrideGrade !== null)
  @IsString()
  @MinLength(1)
  overrideGrade!: string | null;
}
