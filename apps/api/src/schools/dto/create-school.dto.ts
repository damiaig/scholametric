import { Type } from "class-transformer";
import { IsEmail, IsEnum, IsString, Matches, MinLength, ValidateNested } from "class-validator";
import { SchoolType } from "@prisma/client";

class CreateSchoolAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class CreateSchoolDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: "slug must be a url-safe slug" })
  slug!: string;

  @IsEnum(SchoolType)
  type!: SchoolType;

  @ValidateNested()
  @Type(() => CreateSchoolAdminDto)
  admin!: CreateSchoolAdminDto;
}
