export interface UploadUrlRequest {
  storageKey: string;
  contentType: string;
  maxSizeBytes: number;
}

export interface UploadUrlResult {
  uploadUrl: string;
  storageKey: string;
  expiresAt: Date;
}

export interface ObjectMetadata {
  sizeBytes: number;
  contentType: string;
}

export interface DownloadUrlResult {
  downloadUrl: string;
  expiresAt: Date;
}

// v0.8.2 step 3 (SPEC_V0.8.2.md §6 item 3) — the ONE seam every file
// operation goes through, so swapping Firebase -> Cloudflare R2 later is
// a new implementation + config, not a rewrite of any caller. An abstract
// class, not a plain `interface` — TypeScript interfaces don't exist at
// runtime, so they can't be a NestJS DI token; this is the first
// "swappable provider" in this codebase (every other domain service is
// injected by its own concrete class), deliberately chosen here because
// this is exactly the case that pattern is for.
//
// Deliberately tenant-agnostic: `storageKey` is an opaque string this
// class never inspects. It does NOT know about schools or homework —
// tenant scoping happens because the CALLER constructs keys that embed
// schoolId (e.g. `schools/{schoolId}/homework/{homeworkId}/...`), the
// same "the wall lives in application logic, not the primitive" shape
// forSchool()-scoped Prisma queries already rely on discipline for.
//
// maxSizeBytes is REQUIRED on issueUploadUrl, never optional-with-a-
// default — no call site gets a silent "unlimited" path.
export abstract class StorageService {
  /**
   * A signed, time-limited URL the CLIENT uploads directly to — never
   * through the API server. maxSizeBytes is baked into the signed URL
   * itself (the Firebase implementation uses GCS's
   * X-Goog-Content-Length-Range), a storage-layer-enforced ceiling, not
   * just a declared value the client could ignore.
   */
  abstract issueUploadUrl(request: UploadUrlRequest): Promise<UploadUrlResult>;

  /**
   * The ACTUAL size/type of whatever was uploaded, read back from the
   * storage provider — the caller verifies this before writing a
   * permanent DB row, never trusting the client's declared size. Null if
   * nothing has ever been uploaded to this key.
   */
  abstract getObjectMetadata(storageKey: string): Promise<ObjectMetadata | null>;

  /**
   * A signed, time-limited URL for reading a file back — same
   * "bypass the API server for bytes" shape as upload.
   */
  abstract issueDownloadUrl(storageKey: string): Promise<DownloadUrlResult>;

  abstract deleteObject(storageKey: string): Promise<void>;
}
