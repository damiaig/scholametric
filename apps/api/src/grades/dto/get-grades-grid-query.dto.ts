import { IsUUID } from "class-validator";

export class GetGradesGridQueryDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  componentId!: string;

  @IsUUID()
  termId!: string;
}
