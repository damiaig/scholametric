import { IsUUID } from "class-validator";

// The whole-year Exams view (SPEC_V0.7.md §4) — spans every term in one
// session, so session is the only scope needed (YearExamResult itself has
// no classArmId — a student may move class arms between terms).
export class GetYearExamsQueryDto {
  @IsUUID()
  sessionId!: string;
}
