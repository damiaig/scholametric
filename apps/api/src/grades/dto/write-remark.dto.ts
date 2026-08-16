import { IsString, IsUUID, MinLength, ValidateIf } from "class-validator";

// Shared by PUT /students/:id/remarks/teacher and .../principal (SPEC_V0.5.md
// §2.4/Q6) — same shape, different column written depending on the route.
// remark is required-but-nullable, same reasoning as OverrideGradeDto:
// omitting the key is a client error, not "leave it alone"; explicit null
// clears the remark (and its who/when stamps).
export class WriteRemarkDto {
  @IsUUID()
  termId!: string;

  @IsUUID()
  sessionId!: string;

  @ValidateIf((o) => o.remark !== null)
  @IsString()
  @MinLength(1)
  remark!: string | null;
}
