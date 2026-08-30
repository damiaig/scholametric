import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from "class-validator";
import { ExamScoreItemDto } from "./exam-score-item.dto";

export class SaveExamScoresDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  examId!: string;

  @IsUUID()
  termId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: "At least 1 score is required." })
  @ValidateNested({ each: true })
  @Type(() => ExamScoreItemDto)
  scores!: ExamScoreItemDto[];
}
