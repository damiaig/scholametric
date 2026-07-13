import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { UserRole, UserStatus } from "@prisma/client";

const ASSIGNABLE_ROLES = [UserRole.SCHOOL_ADMIN, UserRole.TEACHER] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: typeof ASSIGNABLE_ROLES[number];

  @IsOptional()
  @IsIn([UserStatus.ACTIVE, UserStatus.DISABLED])
  status?: UserStatus;
}
