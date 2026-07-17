import { IsEnum, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { JobTitle, UserRole, UserStatus } from "@prisma/client";

const PERSONNEL_ASSIGNABLE_ROLES = [UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER] as const;

export class UpdatePersonnelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsIn(PERSONNEL_ASSIGNABLE_ROLES)
  role?: (typeof PERSONNEL_ASSIGNABLE_ROLES)[number];

  @IsOptional()
  @IsEnum(JobTitle)
  jobTitle?: JobTitle;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsIn([UserStatus.ACTIVE, UserStatus.DISABLED])
  status?: UserStatus;
}
