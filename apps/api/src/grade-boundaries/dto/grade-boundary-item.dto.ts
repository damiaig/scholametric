import { IsInt, IsString, Max, Min, MinLength } from "class-validator";

export class GradeBoundaryItemDto {
  @IsString()
  @MinLength(1)
  grade!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  minScore!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  maxScore!: number;

  @IsString()
  @MinLength(1)
  remark!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}
