import { IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateClassLevelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  rank?: number;
}
