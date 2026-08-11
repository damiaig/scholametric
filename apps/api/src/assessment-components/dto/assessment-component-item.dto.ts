import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from "class-validator";

export class AssessmentComponentItemDto {
  // Present for an existing component the client wants updated in place;
  // absent for a genuinely new one. See AssessmentComponentsService.replaceAll.
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  weight!: number;

  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxScore?: number;
}
