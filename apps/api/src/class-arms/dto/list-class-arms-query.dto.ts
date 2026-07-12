import { IsOptional, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination/pagination-query.dto";

export class ListClassArmsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  classLevelId?: string;
}
