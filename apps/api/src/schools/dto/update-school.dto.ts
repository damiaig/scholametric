import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { SchoolStatus, SchoolType } from "@prisma/client";

// Deliberately no `slug` field — immutable after creation (SPEC_V0.1.md §2).
export class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(SchoolType)
  type?: SchoolType;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(SchoolStatus)
  status?: SchoolStatus;
}
