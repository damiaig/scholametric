import { IsNumber, IsOptional, IsUUID, Max, Min } from "class-validator";

// Outer sanity bound only (0-100) — the real bound is the specific
// component's max_score (1-100, dynamic per component), checked in
// GradesService against the actual row, not expressible here.
export class GridScoreItemDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  rawScore?: number | null;
}
