import { IsUUID } from "class-validator";

export class GetEvaluationScoresQueryDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  evaluationId!: string;

  @IsUUID()
  termId!: string;
}
