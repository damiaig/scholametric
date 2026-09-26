import { IsBoolean, IsDateString, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

// v0.8.2 step 1 (SPEC_V0.8.2.md §6 item 1) — text-only for now (no files
// until Steps 3-4). sessionId is never a client input — derived
// server-side from termId, same as CreateEvaluationDto. description
// capped at 5000 (vs. evaluations' 2000) since the spec's own "view more"
// modal implies longer text is expected here.
export class CreateHomeworkDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description!: string;

  @IsDateString()
  dueDate!: string;

  @IsBoolean()
  requiresUpload!: boolean;
}
