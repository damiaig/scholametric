import { Type } from "class-transformer";
import { IsDate, IsEmail, IsEnum, IsOptional, IsString, MaxDate, MinLength } from "class-validator";
import { Gender } from "@prisma/client";

// Bio/guardian fields only — class transfer is /transfer-class, status is
// /withdraw, admissionNumber is immutable after creation.
export class UpdateStudentDto {
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
  middleName?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(() => new Date(), { message: "dateOfBirth must be in the past" })
  dateOfBirth?: Date;

  @IsOptional()
  @IsString()
  @MinLength(1)
  guardianName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  guardianPhone?: string;

  @IsOptional()
  @IsEmail()
  guardianEmail?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
