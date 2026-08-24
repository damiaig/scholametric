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
    // Each of the 11 sequential requests runs a REAL bcrypt-cost-12
    // compare — auth.service.ts's login() deliberately hashes against a
    // dummy hash even when the user/school doesn't exist, so response
    // timing can't leak which part of the credential was wrong. That's
    // correct, load-bearing security behavior, not something to weaken
    // for test speed. Under normal load this test takes ~1.5-2s; under
    // heavy concurrent CPU contention (e.g. a Docker build running at the
    // same time) it has been observed taking 20s+, which flaked against
    // this test's old 20000ms timeout — a jest-runtime ceiling, not a
    // rate-limiter correctness issue. 45s stays comfortably under the
    // login throttle's own 60000ms TTL window (AuthController's
    // @Throttle({default:{limit:10,ttl:60000}})) — the real ceiling this
    // test needs to finish inside for its own assertions to stay
    // meaningful — while giving ~20x headroom over the normal-case
    // runtime instead of ~10x.
    "429s the 11th rapid login attempt from one IP",
    async () => {
      const attempt = () =>
        request(app.getHttpServer())
          .post("/api/v1/auth/login")
          .send({ identifier: "nobody@sunrise.test", password: "wrong", schoolSlug: "sunrise" });

      const responses = [];
      for (let i = 0; i < 11; i++) {
        responses.push(await attempt());
      }

      responses.slice(0, 10).forEach((response) => {
        expect(response.status).toBe(401);
      });
      expect(responses[10].status).toBe(429);
    },
    45000,
  );
});
