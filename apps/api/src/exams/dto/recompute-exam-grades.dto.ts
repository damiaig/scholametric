import { IsUUID } from "class-validator";

// Manual re-trigger, mirrors RecomputeGradesDto (grades/dto) — re-derives a
// subject's term_subject_exam_results from ALL current exam_scores across
// every active Exam for this class arm + subject + term.
export class RecomputeExamGradesDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
