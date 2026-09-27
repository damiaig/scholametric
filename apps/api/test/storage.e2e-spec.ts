import { INestApplication } from "@nestjs/common";
import { createTestApp } from "./utils/create-test-app";
import { StorageService } from "../src/storage/storage.service";
import { FakeStorageService } from "./utils/fake-storage.service";

// v0.8.2 step 3 (SPEC_V0.8.2.md §6 item 3) — the storage foundation. No
// HTTP endpoints exist yet (that's step 4), so this proves: (a) the whole
// app still boots correctly with StorageModule wired into AppModule, and
// (b) createTestApp()'s override correctly substitutes FakeStorageService
// for every test in this suite — no live Firebase call is possible in CI.
describe("Storage (e2e) — SPEC_V0.8.2.md §6 item 3, v0.8.2 step 3", () => {
  let app: INestApplication;
  let storage: StorageService;

  beforeAll(async () => {
    app = await createTestApp();
    storage = app.get(StorageService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("resolves StorageService to the fake in tests", () => {
    expect(storage).toBeInstanceOf(FakeStorageService);
  });

  it("issues an upload URL carrying the requested storage key", async () => {
    const result = await storage.issueUploadUrl({
      storageKey: "schools/test-school/homework/test-homework/file.pdf",
      contentType: "application/pdf",
      maxSizeBytes: 10 * 1024 * 1024,
    });

    expect(result.storageKey).toBe("schools/test-school/homework/test-homework/file.pdf");
    expect(result.uploadUrl).toContain(encodeURIComponent(result.storageKey));
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns null metadata for a key nothing was ever uploaded to", async () => {
    const metadata = await storage.getObjectMetadata("schools/test-school/never-uploaded.pdf");
    expect(metadata).toBeNull();
  });

  it("returns seeded metadata, then null after delete", async () => {
    const storageKey = "schools/test-school/homework/test-homework/seeded.pdf";
    (storage as FakeStorageService).seedObject(storageKey, {
      sizeBytes: 2048,
      contentType: "application/pdf",
    });

    const metadata = await storage.getObjectMetadata(storageKey);
    expect(metadata).toEqual({ sizeBytes: 2048, contentType: "application/pdf" });

    await storage.deleteObject(storageKey);

    expect(await storage.getObjectMetadata(storageKey)).toBeNull();
  });

  it("issues a download URL", async () => {
    const result = await storage.issueDownloadUrl("schools/test-school/homework/file.pdf");
    expect(result.downloadUrl).toContain("download");
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
