import { IsString, MaxLength, MinLength } from "class-validator";

// v0.8.4 step 3 (SPEC_V0.8.4.md §5) — independently declared, not imported
// from homework/dto (the exact lessons→homework coupling every prior
// step has avoided). Identical shape to homework's own RequestUploadUrlDto:
// sizeBytes is deliberately NOT part of this DTO — the server computes
// the remaining budget itself and caps the signed URL at the storage
// layer, so a client-declared size would add no security value.
export class RequestUploadUrlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(127)
  contentType!: string;
}
