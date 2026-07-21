import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { GradeBoundaryItemDto } from "./grade-boundary-item.dto";

// Body is { boundaries: [...] } — see docs/DECISIONS.md, same convention
// choice as ReplaceAssessmentComponentsDto. Cross-item rules (tiling
// 0-100 with no gaps/overlaps, unique grades) are
// GradeBoundariesService's job — no single-item decorator can express them.
export class ReplaceGradeBoundariesDto {
  @IsArray()
  @ArrayMinSize(2, { message: "At least 2 grade boundaries are required." })
  @ArrayMaxSize(12, { message: "At most 12 grade boundaries are allowed." })
  @ValidateNested({ each: true })
  @Type(() => GradeBoundaryItemDto)
  boundaries!: GradeBoundaryItemDto[];
}
