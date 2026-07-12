import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { StudentStatus } from "@prisma/client";
import { PaginationQueryDto } from "../../common/pagination/pagination-query.dto";

export class ListStudentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  classArmId?: string;

  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
