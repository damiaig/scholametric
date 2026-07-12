import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class UpdateClassArmDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUUID()
  classLevelId?: string;
}
