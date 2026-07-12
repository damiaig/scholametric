import { IsDateString, IsOptional, IsString, MinLength } from "class-validator";

// Deliberately no `isCurrent` — only /sessions/:id/activate may flip it.
export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @IsOptional()
  @IsDateString()
  endsOn?: string;
}
