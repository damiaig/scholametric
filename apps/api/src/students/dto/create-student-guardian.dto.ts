import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { GuardianRelationship } from "@prisma/client";

// Used only inside CreateStudentDto.guardians[] — unlike the standalone
// AddStudentGuardianDto, isPrimary is accepted here: at creation time there
// is no existing primary to "steal" from (SPEC_V0.2.md §2).
export class CreateStudentGuardianDto {
  @IsOptional()
  @IsUUID()
  guardianId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsEnum(GuardianRelationship)
  relationship!: GuardianRelationship;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
