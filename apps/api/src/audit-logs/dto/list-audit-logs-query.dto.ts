import { IsOptional, IsString, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination/pagination-query.dto";

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;
}
