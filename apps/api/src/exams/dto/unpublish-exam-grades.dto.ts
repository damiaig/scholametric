import { IsUUID } from "class-validator";

// Same shape as PublishExamGradesDto — kept as its own class (not reused)
// to match this codebase's one-DTO-per-endpoint convention.
export class UnpublishExamGradesDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
