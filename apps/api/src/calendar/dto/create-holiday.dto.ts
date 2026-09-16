import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateHolidayDto {
  @IsUUID()
  sessionId!: string;

  // Optional — an inter-term break (Christmas/Sallah) doesn't belong to
  // one specific Term row the way a public holiday mid-term does.
  @IsOptional()
  @IsUUID()
  termId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsDateString()
  startDate!: string;

  // A single-day holiday has startDate === endDate, not a separate shape.
  @IsDateString()
  endDate!: string;
}
