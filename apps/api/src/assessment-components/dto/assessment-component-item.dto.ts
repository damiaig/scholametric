import { IsInt, IsString, Min, MinLength } from "class-validator";

export class AssessmentComponentItemDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  weight!: number;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}
