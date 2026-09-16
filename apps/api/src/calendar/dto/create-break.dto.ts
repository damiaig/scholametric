import { IsMilitaryTime, IsString, MinLength } from "class-validator";

export class CreateBreakDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsMilitaryTime()
  startsAt!: string;

  @IsMilitaryTime()
  endsAt!: string;
}
