import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { ResultStatus } from "@prisma/client";

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — mirrors GetGradesReviewQueryDto
// (grades/dto) exactly, retargeted to the exam track's admin
// pending-approvals surface.
export class GetExamsReviewQueryDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  termId!: string;

  // Filters to subjects with at least one student in this status — a
  // subject's state is a breakdown (draft/pending/published counts can
  // coexist), not one value (see ExamsService.getReview()'s doc comment).
  @IsOptional()
  @IsEnum(ResultStatus)
  status?: ResultStatus;
}
