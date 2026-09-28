import { IsString, MaxLength, MinLength } from "class-validator";

// v0.8.2 step 4 — the commit step after a client has PUT its bytes to the
// signed URL. storageKey is checked against the server-generated prefix
// for the caller's own (schoolId, homeworkId[, studentId]) in
// HomeworkService before anything else runs — see docs/DECISIONS.md for
// why (the tenant-isolation guard for this table). sizeBytes/contentType
// are NOT trusted from this DTO for the persisted row — the service reads
// StorageService.getObjectMetadata()'s verified values instead; fileName
// here is a display label only.
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
