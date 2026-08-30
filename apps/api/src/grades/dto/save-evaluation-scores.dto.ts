import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from "class-validator";
import { EvaluationScoreItemDto } from "./evaluation-score-item.dto";

export class SaveEvaluationScoresDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  evaluationId!: string;

  @IsUUID()
  termId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: "At least 1 score is required." })
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreItemDto)
  scores!: EvaluationScoreItemDto[];
}
