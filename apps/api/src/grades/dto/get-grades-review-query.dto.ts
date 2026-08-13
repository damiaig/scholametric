import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { ResultStatus } from "@prisma/client";

export class GetGradesReviewQueryDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  termId!: string;

  // Filters to subjects with at least one student in this status — a
  // subject's state is a breakdown (draft/pending/published counts can
  // coexist), not one value, so this can't mean "subjects whose ONLY
  // status is X" (see GradesService.getReview()'s doc comment).
  @IsOptional()
  @IsEnum(ResultStatus)
  status?: ResultStatus;
}
