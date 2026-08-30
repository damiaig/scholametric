import { IsUUID } from "class-validator";

// Publishing is per class arm + subject + term (bulk action), mirrors
// PublishGradesDto (grades/dto) — same publish model as v0.4, applied to
// the exam track.
export class PublishExamGradesDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
