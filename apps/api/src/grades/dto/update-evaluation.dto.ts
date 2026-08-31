import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// Name/description only — deliberately narrow (SPEC_V0.7.md Q4: "fix a
// typo," not re-scoping). Both optional at the DTO level so a caller can
// send just one; GradesService 400s if neither is present at all.
export class UpdateEvaluationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description?: string;
}
