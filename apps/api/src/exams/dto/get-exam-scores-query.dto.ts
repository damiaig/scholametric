import { IsUUID } from "class-validator";

export class GetExamScoresQueryDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  examId!: string;

  @IsUUID()
  termId!: string;
}
