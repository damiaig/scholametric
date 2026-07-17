import { Type } from "class-transformer";
import { IsDate, IsEnum, IsOptional, IsString, MaxDate, MinLength } from "class-validator";
import { Gender } from "@prisma/client";

// Bio fields only — class transfer is /transfer-class, status is /withdraw,
// admissionNumber is immutable after creation. Guardian fields moved out in
// v0.2 (SPEC_V0.2.md §2): edit a specific guardian via PATCH /guardians/:id,
// or the set of guardians via POST/DELETE /students/:id/guardians.
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
}
