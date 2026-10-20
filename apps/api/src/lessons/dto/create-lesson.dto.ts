import { IsDateString, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

// v0.8.4 step 1 (SPEC_V0.8.4.md §2) — text-only for now (files are step
// 3). sessionId is never a client input — derived server-side from the
// school's current AcademicSession. `body` capped at 5000, same as
// homework's `description` (the spec's own "view more" modal implies
// longer text is expected here, same reasoning).
export class CreateLessonDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsDateString()
  lessonDate!: string;
}
