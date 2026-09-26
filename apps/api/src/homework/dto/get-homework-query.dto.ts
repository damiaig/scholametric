import { IsUUID } from "class-validator";

export class GetHomeworkQueryDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
