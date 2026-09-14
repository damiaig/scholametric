import { IsUUID } from "class-validator";

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — same shape as
// SubmitExamForApprovalDto, kept as its own class (not reused) to match
// this codebase's one-DTO-per-endpoint convention.
export class ApproveExamDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
