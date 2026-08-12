import { IsUUID } from "class-validator";

// Same shape as PublishGradesDto — kept as its own class (not reused)
// to match this codebase's one-DTO-per-endpoint convention even where
// shapes coincide.
export class UnpublishGradesDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
