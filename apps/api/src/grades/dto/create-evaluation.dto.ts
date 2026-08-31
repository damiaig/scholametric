import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

// v0.7 step 2 (SPEC_V0.7.md §3): a teacher-created evaluation — name and
// description are both required per Dami's confirmed decision. classArmId/
// subjectId/termId are immutable once created (see UpdateEvaluationDto —
// re-scoping isn't a "fix a typo" edit, it's delete+recreate).
export class CreateEvaluationDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;
}
