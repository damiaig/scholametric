import { IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination/pagination-query.dto";

export class ListTermsQueryDto extends PaginationQueryDto {
  @IsUUID()
  sessionId!: string;
}
