import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination/pagination-query.dto";

export class ListTeachersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
