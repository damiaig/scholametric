import { IsIn, IsOptional, IsString } from "class-validator";
import { UserRole } from "@prisma/client";
import { PaginationQueryDto } from "../../common/pagination/pagination-query.dto";

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn([UserRole.SCHOOL_ADMIN, UserRole.TEACHER])
  role?: UserRole;

  @IsOptional()
  @IsString()
  search?: string;
}
