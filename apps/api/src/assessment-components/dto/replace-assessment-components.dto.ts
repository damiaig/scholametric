import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { AssessmentComponentItemDto } from "./assessment-component-item.dto";

// Body is { components: [...] }, not a bare array — matches this codebase's
// existing convention for array-body PUTs (see SetSubjectLevelsDto), not a
// literal reading of SPEC_V0.3.md §2's shorthand notation. See
// docs/DECISIONS.md. Per-item shape (name/weight/sortOrder types) is
// class-validator's job below; cross-item rules (count bounds already
// enforced here, weights summing to exactly 100, unique names) that no
// single-item decorator can express are AssessmentComponentsService's job.
export class ReplaceAssessmentComponentsDto {
  @IsArray()
  @ArrayMinSize(1, { message: "At least 1 assessment component is required." })
  @ArrayMaxSize(8, { message: "At most 8 assessment components are allowed." })
  @ValidateNested({ each: true })
  @Type(() => AssessmentComponentItemDto)
  components!: AssessmentComponentItemDto[];
}
