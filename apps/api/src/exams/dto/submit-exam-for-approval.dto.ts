import { IsUUID } from "class-validator";

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — replaces PublishExamGradesDto. Same
// shape (subject-level bulk action, no per-exam id) — only the target
// status this triggers changed (PENDING_APPROVAL, not PUBLISHED).
export class SubmitExamForApprovalDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
