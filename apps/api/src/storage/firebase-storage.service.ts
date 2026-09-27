import { cert, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import {
  DownloadUrlResult,
  ObjectMetadata,
  StorageService,
  UploadUrlRequest,
  UploadUrlResult,
} from "./storage.service";

export interface FirebaseStorageConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  bucket: string;
}

const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
const DOWNLOAD_URL_TTL_MS = 60 * 60 * 1000;

// v0.8.2 step 3 — the one concrete StorageService this app actually ships
// with. Size-cap enforcement happens at the storage layer, not by trusting
// the client: X-Goog-Content-Length-Range is baked into the V4 signed
// upload URL itself, so GCS rejects an oversized PUT before it's ever
// written — independent of whatever size the client declared.
export class FirebaseStorageService extends StorageService {
  private readonly bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>;

  constructor(config: FirebaseStorageConfig) {
    super();
    const app = initializeApp({
      credential: cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        // service-account JSON's private_key contains literal `\n`
        // sequences; a single-line .env value needs them unescaped
        // before firebase-admin can parse the PEM.
        privateKey: config.privateKey.replace(/\\n/g, "\n"),
      }),
      storageBucket: config.bucket,
    });
    this.bucket = getStorage(app).bucket();
  }

  async issueUploadUrl(request: UploadUrlRequest): Promise<UploadUrlResult> {
    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_MS);
    const file = this.bucket.file(request.storageKey);
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType: request.contentType,
      extensionHeaders: {
        "X-Goog-Content-Length-Range": `0,${request.maxSizeBytes}`,
      },
    });
    return { uploadUrl, storageKey: request.storageKey, expiresAt };
  }

  async getObjectMetadata(storageKey: string): Promise<ObjectMetadata | null> {
    const file = this.bucket.file(storageKey);
    const [exists] = await file.exists();
    if (!exists) {
      return null;
    }
    const [metadata] = await file.getMetadata();
    return {
      sizeBytes: Number(metadata.size ?? 0),
      contentType: metadata.contentType ?? "application/octet-stream",
    };
  }

  async issueDownloadUrl(storageKey: string): Promise<DownloadUrlResult> {
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_MS);
    const file = this.bucket.file(storageKey);
    const [downloadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });
    return { downloadUrl, expiresAt };
  }

  async deleteObject(storageKey: string): Promise<void> {
    const file = this.bucket.file(storageKey);
    await file.delete({ ignoreNotFound: true });
  }
}
