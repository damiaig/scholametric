import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateSubjectDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;
}
