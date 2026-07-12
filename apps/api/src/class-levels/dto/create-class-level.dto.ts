import { IsInt, IsString, MinLength } from "class-validator";

export class CreateClassLevelDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  rank!: number;
}
