import { IsUUID } from "class-validator";

// No componentId: recompute re-derives a subject's term_subject_results
// from ALL of a student's current student_scores rows across every active
// component, same as the recompute that already runs at the end of PUT
// /grades/grid — this is just a manual re-trigger (e.g. after a roster fix)
// for a whole class arm + subject + term.
export class RecomputeGradesDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
