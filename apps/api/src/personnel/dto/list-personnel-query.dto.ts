import { IsEnum, IsIn, IsOptional, IsString } from "class-validator";
import { JobTitle, UserRole } from "@prisma/client";
import { PaginationQueryDto } from "../../common/pagination/pagination-query.dto";

export class ListPersonnelQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn([UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER])
  role?: UserRole;

  @IsOptional()
  @IsEnum(JobTitle)
  jobTitle?: JobTitle;

  @IsOptional()
  @IsString()
  search?: string;
}
