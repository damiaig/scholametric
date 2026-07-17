import { IsOptional, IsString, MinLength } from "class-validator";

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;
}
