import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { GuardianRelationship } from "@prisma/client";

// No isPrimary field, deliberately: adding a guardian to a student who
// already has one or more never steals primary (SPEC_V0.2.md §2) — the
// server always computes it (true only if this is the student's first-ever
// guardian link), the caller has no way to override that here. Changing
// who's primary is only possible via PUT .../primary.
export class AddStudentGuardianDto {
  // Sibling mode: link an existing guardian record instead of creating one.
  @IsOptional()
  @IsUUID()
  guardianId?: string;

  // Create-new mode: required unless guardianId is supplied (checked in
  // the service — "required unless X" isn't expressible with plain
  // class-validator decorators).
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
}
