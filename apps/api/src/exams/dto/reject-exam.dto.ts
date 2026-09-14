import { IsUUID } from "class-validator";

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — bare state revert, no reason field
// (confirmed: scope creep beyond the frozen five items). Same shape as
// ApproveExamDto/SubmitExamForApprovalDto.
export class RejectExamDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
