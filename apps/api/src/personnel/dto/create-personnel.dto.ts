import { IsDateString, IsEmail, IsEnum, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { JobTitle, UserRole } from "@prisma/client";

// SUPER_ADMIN is provisioned only via school creation; PARENT/STUDENT
// accounts don't exist yet (v0.2 scope, same boundary as v0.1's /users).
const PERSONNEL_CREATABLE_ROLES = [UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER] as const;

// Unlike v0.1's /users (which generated a temporary password), SPEC_V0.2.md
// §2's POST /personnel body includes `password` explicitly — the caller
// supplies it, same shape as POST /schools' admin sub-object.
export class CreatePersonnelDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsIn(PERSONNEL_CREATABLE_ROLES)
  role!: (typeof PERSONNEL_CREATABLE_ROLES)[number];

  @IsEnum(JobTitle)
  jobTitle!: JobTitle;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsDateString()
  dateEmployed?: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
