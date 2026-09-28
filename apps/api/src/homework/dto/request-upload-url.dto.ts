import { IsString, MaxLength, MinLength } from "class-validator";

// v0.8.2 step 4 — shared shape for both the teacher-attachment and
// student-submission upload-url requests. sizeBytes is deliberately NOT
// part of this DTO: the server computes the remaining budget itself and
// caps the signed URL at the storage layer (StorageService), so a
// client-declared size would add no security value, only noise.
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
