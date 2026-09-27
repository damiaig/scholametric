import {
  DownloadUrlResult,
  ObjectMetadata,
  StorageService,
  UploadUrlRequest,
  UploadUrlResult,
} from "../../src/storage/storage.service";

/**
 * In-memory StorageService for e2e tests — wired in via createTestApp()'s
 * `.overrideProvider(StorageService)`, so no test ever makes a real
 * Firebase call. A real client uploads by PUTting bytes straight to the
 * signed URL (never through this API), which a fake can't receive —
 * seedObject() simulates "a file was already uploaded" for tests that
 * need to exercise the post-upload path (metadata read, delete).
 */
export class FakeStorageService extends StorageService {
  private readonly objects = new Map<string, ObjectMetadata>();

  seedObject(storageKey: string, metadata: ObjectMetadata): void {
    this.objects.set(storageKey, metadata);
  }

  async issueUploadUrl(request: UploadUrlRequest): Promise<UploadUrlResult> {
    return {
      uploadUrl: `https://fake-storage.test/upload/${encodeURIComponent(request.storageKey)}`,
      storageKey: request.storageKey,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  }

  async getObjectMetadata(storageKey: string): Promise<ObjectMetadata | null> {
    return this.objects.get(storageKey) ?? null;
  }

  async issueDownloadUrl(storageKey: string): Promise<DownloadUrlResult> {
    return {
      downloadUrl: `https://fake-storage.test/download/${encodeURIComponent(storageKey)}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
  }

  async deleteObject(storageKey: string): Promise<void> {
    this.objects.delete(storageKey);
  }
}
