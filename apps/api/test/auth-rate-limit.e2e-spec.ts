import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";

// A fresh app instance so this file gets its own in-memory throttler storage —
// running these requests against the app from auth.e2e-spec.ts would inherit
// whatever quota those login attempts already consumed.
describe("Auth login rate limit (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it(
    "429s the 11th rapid login attempt from one IP",
    async () => {
      const attempt = () =>
        request(app.getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email: "nobody@sunrise.test", password: "wrong", schoolSlug: "sunrise" });

      const responses = [];
      for (let i = 0; i < 11; i++) {
        responses.push(await attempt());
      }

      responses.slice(0, 10).forEach((response) => {
        expect(response.status).toBe(401);
      });
      expect(responses[10].status).toBe(429);
    },
    20000,
  );
});
