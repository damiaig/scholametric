import { IsOptional, IsString } from "class-validator";

export class SearchSchoolsDto {
  @IsOptional()
  @IsString()
  q?: string;
}
