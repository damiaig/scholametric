import { IsInt, IsMilitaryTime, IsOptional, IsString, Min, MinLength } from "class-validator";

export class UpdatePeriodDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsMilitaryTime()
  startsAt?: string;

  @IsOptional()
  @IsMilitaryTime()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
