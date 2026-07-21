import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";

// The deprecated /users controller (superseded by /personnel, SPEC_V0.2.md
// §2) is removed entirely in v0.3 (SPEC_V0.3.md §1) — this suite exists only
// to prove the routes are actually gone, not to exercise behavior.
describe("Users (removed in v0.3, e2e)", () => {
  let app: INestApplication;
  let sunriseAdminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /users 404s", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${sunriseAdminToken}`);
    expect(response.status).toBe(404);
  });

  it("POST /users 404s", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${sunriseAdminToken}`)
      .send({ email: `x.${randomUUID()}@sunrise.test`, firstName: "A", lastName: "B", role: "TEACHER" });
    expect(response.status).toBe(404);
  });

  it("PATCH /users/:id 404s", async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/users/${randomUUID()}`)
      .set("Authorization", `Bearer ${sunriseAdminToken}`)
      .send({ firstName: "New" });
    expect(response.status).toBe(404);
  });

  it("POST /users/:id/reset-password 404s", async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/users/${randomUUID()}/reset-password`)
      .set("Authorization", `Bearer ${sunriseAdminToken}`);
    expect(response.status).toBe(404);
  });
});
