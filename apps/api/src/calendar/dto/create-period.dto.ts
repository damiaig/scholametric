import { IsInt, IsMilitaryTime, IsString, Min, MinLength } from "class-validator";

export class CreatePeriodDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsMilitaryTime()
  startsAt!: string;

  @IsMilitaryTime()
  endsAt!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}
