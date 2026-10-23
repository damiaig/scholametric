import { IsString, MaxLength, MinLength } from "class-validator";

// v0.8.4 step 3 (SPEC_V0.8.4.md §5) — independently declared, not imported
// from homework/dto. storageKey is checked against the server-generated
// prefix for the caller's own (schoolId, lessonId) in LessonService before
// anything else runs — the tenant-isolation guard for this table.
// sizeBytes/contentType are NOT trusted from this DTO for the persisted
// row — the service reads StorageService.getObjectMetadata()'s verified
// values instead; fileName here is a display label only.
export class CommitFileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  storageKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(127)
  contentType!: string;
}
