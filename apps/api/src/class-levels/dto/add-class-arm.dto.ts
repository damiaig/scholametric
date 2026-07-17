import { IsString, MinLength } from "class-validator";

export class AddClassArmDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
