import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/** CLAUDE.md §5: page/pageSize on every list endpoint, pageSize capped at 100. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
