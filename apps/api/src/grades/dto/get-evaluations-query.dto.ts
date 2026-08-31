import { IsUUID } from "class-validator";

export class GetEvaluationsQueryDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
