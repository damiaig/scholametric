import { Type } from "class-transformer";
import { IsDate, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxDate, MinLength } from "class-validator";
import { Gender } from "@prisma/client";

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

  @IsString()
  @MinLength(1)
  guardianName!: string;

  @IsString()
  @MinLength(1)
  guardianPhone!: string;

  @IsOptional()
  @IsEmail()
  guardianEmail?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsUUID()
  classArmId!: string;

  // Server-generates SLUG/year/NNNN if omitted; caller may override with a
  // custom value as long as it's unique within the school (SPEC_V0.1.md §1).
  @IsOptional()
  @IsString()
  @MinLength(1)
  admissionNumber?: string;
}
