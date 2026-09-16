import { IsMilitaryTime, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateBreakDto {
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
}
