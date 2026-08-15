import { IsString, IsUUID, MinLength } from "class-validator";

export class UnlockTermDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
