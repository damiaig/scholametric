import { IsUUID } from "class-validator";

export class RelockTermDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;
}
