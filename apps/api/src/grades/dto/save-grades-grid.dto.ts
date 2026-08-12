import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from "class-validator";
import { GridScoreItemDto } from "./grid-score-item.dto";

export class SaveGradesGridDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  componentId!: string;

  @IsUUID()
  termId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: "At least 1 score is required." })
  @ValidateNested({ each: true })
  @Type(() => GridScoreItemDto)
  scores!: GridScoreItemDto[];
}
