import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDate, IsEnum, IsOptional, IsString, IsUUID, MaxDate, MinLength, ValidateNested } from "class-validator";
import { Gender } from "@prisma/client";
import { CreateStudentGuardianDto } from "./create-student-guardian.dto";

// v0.2 (SPEC_V0.2.md §2, a deliberate breaking change from v0.1 — see
// docs/DECISIONS.md): guardianName/guardianPhone/guardianEmail/address are
// no longer accepted here. Guardians are now guardians[] (min 1), written
// only to the new guardians/student_guardians tables.
export class CreateStudentDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsEnum(Gender)
  gender!: Gender;

  @Type(() => Date)
  @IsDate()
  @MaxDate(() => new Date(), { message: "dateOfBirth must be in the past" })
  dateOfBirth!: Date;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStudentGuardianDto)
  guardians!: CreateStudentGuardianDto[];

  @IsUUID()
  classArmId!: string;

  // Server-generates SLUG/year/NNNN if omitted; caller may override with a
  // custom value as long as it's unique within the school (SPEC_V0.1.md §1).
  @IsOptional()
  @IsString()
  @MinLength(1)
  admissionNumber?: string;
}
