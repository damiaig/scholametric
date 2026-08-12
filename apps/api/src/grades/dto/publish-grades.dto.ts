import { IsUUID } from "class-validator";

// Publishing is per class arm + subject + term (bulk action), not per
// student (SPEC_V0.4.md §1) — a director publishes "JSS 1 A English,
// First Term" in one action.
export class PublishGradesDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
