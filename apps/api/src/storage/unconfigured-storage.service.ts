import {
  DownloadUrlResult,
  ObjectMetadata,
  StorageService,
  UploadUrlRequest,
  UploadUrlResult,
} from "./storage.service";

const MISSING_CONFIG_MESSAGE =
  "Firebase storage is not configured — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, " +
  "FIREBASE_PRIVATE_KEY, and FIREBASE_STORAGE_BUCKET to enable file storage.";

// v0.8.2 step 3 — the fallback when the four FIREBASE_* env vars aren't
// all present. Deliberately does NOT throw at construction/boot: those
// vars are optional (the app must stay bootable without a Firebase
// project configured yet), so the error only surfaces when something
// actually tries to use storage.
export class UnconfiguredStorageService extends StorageService {
  issueUploadUrl(_request: UploadUrlRequest): Promise<UploadUrlResult> {
    throw new Error(MISSING_CONFIG_MESSAGE);
  }

  getObjectMetadata(_storageKey: string): Promise<ObjectMetadata | null> {
    throw new Error(MISSING_CONFIG_MESSAGE);
  }

  issueDownloadUrl(_storageKey: string): Promise<DownloadUrlResult> {
    throw new Error(MISSING_CONFIG_MESSAGE);
  }

  deleteObject(_storageKey: string): Promise<void> {
    throw new Error(MISSING_CONFIG_MESSAGE);
  }
}
