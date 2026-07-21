import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";

describe("GET /me/teaching (e2e)", () => {
  let app: INestApplication;
  let sunriseTeacherToken: string;
  let sunriseAdminToken: string;
  let hillcrestTeacherToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    hillcrestTeacherToken = await loginAs(app, "teacher@hillcrest.test", "hillcrest");
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the seeded teacher's real current-session load with enrollment counts", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/me/teaching")
      .set("Authorization", `Bearer ${sunriseTeacherToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.classTeacherOf.some((c: { className: string }) => c.className === "JSS 1 A"),
    ).toBe(true);
    expect(
      response.body.classTeacherOf.some((c: { className: string }) => c.className === "SSS 2 A"),
    ).toBe(true);
    expect(
      response.body.classTeacherOf.every((c: { enrollmentCount: number }) => typeof c.enrollmentCount === "number"),
    ).toBe(true);
    expect(
      response.body.subjects.some(
        (s: { subjectName: string; className: string }) => s.subjectName === "Mathematics" && s.className === "JSS 1 A",
      ),
    ).toBe(true);
  });

  it("returns empty arrays (not an error) for a staff member with no assignments", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/me/teaching")
      .set("Authorization", `Bearer ${sunriseAdminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.classTeacherOf).toEqual([]);
    expect(response.body.subjects).toEqual([]);
  });

  it("is scoped to the caller's own school", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/me/teaching")
      .set("Authorization", `Bearer ${hillcrestTeacherToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.classTeacherOf.some((c: { className: string }) => c.className === "JSS 1 A"),
    ).toBe(true);
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/me/teaching");
    expect(response.status).toBe(401);
  });
});
