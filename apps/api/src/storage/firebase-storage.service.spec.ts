const mockGetSignedUrl = jest.fn();
const mockExists = jest.fn();
const mockGetMetadata = jest.fn();
const mockDelete = jest.fn();
const mockFile = jest.fn(() => ({
  getSignedUrl: mockGetSignedUrl,
  exists: mockExists,
  getMetadata: mockGetMetadata,
  delete: mockDelete,
}));
const mockBucket = jest.fn(() => ({ file: mockFile }));
const mockCert = jest.fn((config: unknown) => config);
const mockInitializeApp = jest.fn(() => ({}));
const mockGetStorage = jest.fn(() => ({ bucket: mockBucket }));

jest.mock("firebase-admin/app", () => ({
  cert: mockCert,
  initializeApp: mockInitializeApp,
}));
jest.mock("firebase-admin/storage", () => ({
  getStorage: mockGetStorage,
}));

import { FirebaseStorageService } from "./firebase-storage.service";

// v0.8.2 step 3 (SPEC_V0.8.2.md §6 item 3) — proves FirebaseStorageService
// constructs the right request shape against a mocked firebase-admin,
// without ever touching a real Firebase project. Run via `pnpm run
// test:unit` (test/jest-unit.json), never test/jest-e2e.json.
describe("FirebaseStorageService (unit) — SPEC_V0.8.2.md §6 item 3, v0.8.2 step 3", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildService(): FirebaseStorageService {
    return new FirebaseStorageService({
      projectId: "test-project",
      clientEmail: "svc@test-project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----\\n",
      bucket: "test-project.appspot.com",
    });
  }

  it("unescapes literal \\n sequences in the private key before calling credential.cert", () => {
    buildService();

    expect(mockCert).toHaveBeenCalledWith(
      expect.objectContaining({
        privateKey: "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n",
      }),
    );
  });

  it("bakes X-Goog-Content-Length-Range into the signed upload URL — storage-layer size cap, not client-trusted", async () => {
    mockGetSignedUrl.mockResolvedValue(["https://signed.example/upload"]);
    const service = buildService();

    const result = await service.issueUploadUrl({
      storageKey: "schools/s1/homework/h1/file.pdf",
      contentType: "application/pdf",
      maxSizeBytes: 5_000_000,
    });

    expect(mockFile).toHaveBeenCalledWith("schools/s1/homework/h1/file.pdf");
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "v4",
        action: "write",
        contentType: "application/pdf",
        extensionHeaders: { "X-Goog-Content-Length-Range": "0,5000000" },
      }),
    );
    expect(result.uploadUrl).toBe("https://signed.example/upload");
    expect(result.storageKey).toBe("schools/s1/homework/h1/file.pdf");
  });

  it("issues a read-action signed URL for downloads", async () => {
    mockGetSignedUrl.mockResolvedValue(["https://signed.example/download"]);
    const service = buildService();

    const result = await service.issueDownloadUrl("schools/s1/homework/h1/file.pdf");

    expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.objectContaining({ action: "read" }));
    expect(result.downloadUrl).toBe("https://signed.example/download");
  });

  it("returns null metadata when the object does not exist", async () => {
    mockExists.mockResolvedValue([false]);
    const service = buildService();

    expect(await service.getObjectMetadata("missing.pdf")).toBeNull();
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });

  it("reads back the actual size/type from storage — never the client's declared value", async () => {
    mockExists.mockResolvedValue([true]);
    mockGetMetadata.mockResolvedValue([{ size: "12345", contentType: "application/pdf" }]);
    const service = buildService();

    const metadata = await service.getObjectMetadata("file.pdf");

    expect(metadata).toEqual({ sizeBytes: 12345, contentType: "application/pdf" });
  });

  it("deletes with ignoreNotFound so a missing object is not an error", async () => {
    const service = buildService();

    await service.deleteObject("file.pdf");

    expect(mockDelete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });
});
