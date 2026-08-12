import { IsNumber, IsOptional, IsUUID, Min } from "class-validator";

// No upper bound here on purpose: the only valid ceiling is the specific
// component's max_score, which is dynamic per component and checked in
// GradesService against the actual row. A DTO-level cap (even a generous
// one) would silently false-reject a legitimate score for any component
// whose max_score exceeds that cap.
export class GridScoreItemDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rawScore?: number | null;
}
