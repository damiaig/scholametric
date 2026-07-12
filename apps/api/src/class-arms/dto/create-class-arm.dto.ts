import { IsString, IsUUID, MinLength } from "class-validator";

export class CreateClassArmDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsUUID()
  classLevelId!: string;
}
