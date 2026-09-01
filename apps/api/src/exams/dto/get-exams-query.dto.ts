import { IsUUID } from "class-validator";

export class GetExamsQueryDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;
}
