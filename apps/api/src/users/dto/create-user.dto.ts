import { IsEmail, IsIn, IsString, MinLength } from "class-validator";
import { UserRole } from "@prisma/client";

// Only these two are creatable here — SUPER_ADMIN is provisioned only via
// school creation, PARENT/STUDENT accounts don't exist yet (v0.1 scope).
const CREATABLE_ROLES = [UserRole.SCHOOL_ADMIN, UserRole.TEACHER] as const;

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsIn(CREATABLE_ROLES)
  role!: typeof CREATABLE_ROLES[number];
}
