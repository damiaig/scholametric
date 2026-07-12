import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";

/** Boots a real Nest app (same pipes/filters/guards as main.ts) for supertest. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  const configService = app.get(ConfigService);
  configureApp(app, configService);
  await app.init();
  return app;
}
