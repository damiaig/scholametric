import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StorageService } from "./storage.service";
import { FirebaseStorageService } from "./firebase-storage.service";
import { UnconfiguredStorageService } from "./unconfigured-storage.service";

// v0.8.2 step 3 — provider selection happens once, here, at boot. All
// four FIREBASE_* vars are OPTIONAL (see env.validation.ts): a dev/CI/test
// environment without a real Firebase project must still boot cleanly,
// falling back to UnconfiguredStorageService rather than failing startup.
@Module({
  providers: [
    {
      provide: StorageService,
      useFactory: (configService: ConfigService): StorageService => {
        const projectId = configService.get<string>("FIREBASE_PROJECT_ID");
        const clientEmail = configService.get<string>("FIREBASE_CLIENT_EMAIL");
        const privateKey = configService.get<string>("FIREBASE_PRIVATE_KEY");
        const bucket = configService.get<string>("FIREBASE_STORAGE_BUCKET");

        if (projectId && clientEmail && privateKey && bucket) {
          return new FirebaseStorageService({ projectId, clientEmail, privateKey, bucket });
        }
        return new UnconfiguredStorageService();
      },
      inject: [ConfigService],
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
