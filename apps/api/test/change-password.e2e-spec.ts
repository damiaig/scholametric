import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { createTestApp } from "./utils/create-test-app";
import { SEED_PASSWORD } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

const NEW_PASSWORD = "BrandNewPassw0rd!";
// v0.8.5 step 1 (SPEC_V0.8.5.md §4) — required on /auth/logout now.
const CSRF_HEADER = { "X-Requested-With": "XMLHttpRequest" };

function findSetCookie(response: request.Response, name: string): string | undefined {
  const raw = response.headers["set-cookie"] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((c) => c.startsWith(`${name}=`));
}

function asCookieHeader(setCookieString: string): string {
  return setCookieString.split(";")[0];
}

describe("Forced password change (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let newTeacherUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const newTeacher = await prisma.user.findUniqueOrThrow({
      where: { schoolId_email: { schoolId: (await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } })).id, email: "newteacher@sunrise.test" } },
    });
    newTeacherUserId = newTeacher.id;
  });

  afterAll(async () => {
    // Restore the seeded fixture's password + flag for future runs/manual
    // exploration — this suite's whole point is changing them.
    await prisma.user.update({
      where: { id: newTeacherUserId },
      data: { passwordHash: await bcrypt.hash(SEED_PASSWORD, 12), mustChangePassword: true },
    });
    await prisma.refreshToken.updateMany({ where: { userId: newTeacherUserId, revokedAt: null }, data: { revokedAt: new Date() } });
    await app.close();
  });

  async function loginAsNewTeacher(password = SEED_PASSWORD) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifier: "newteacher@sunrise.test", password, schoolSlug: "sunrise" });
  }

  it("login response exposes mustChangePassword: true for a flagged user", async () => {
    const response = await loginAsNewTeacher();
    expect(response.status).toBe(200);
    expect(response.body.user.mustChangePassword).toBe(true);
  });

  it("GET /auth/me also exposes the flag", async () => {
    const login = await loginAsNewTeacher();
    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.mustChangePassword).toBe(true);
  });

  it("blocks an arbitrary endpoint with 403 + X-Password-Change-Required header", async () => {
    const login = await loginAsNewTeacher();
    const response = await request(app.getHttpServer())
      .get("/api/v1/students")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(response.status).toBe(403);
    expect(response.headers["x-password-change-required"]).toBe("true");
  });

  it("does NOT block GET /auth/me, POST /auth/logout, or POST /auth/change-password", async () => {
    const login = await loginAsNewTeacher();
    const token = login.body.accessToken;
    const auth = { Authorization: `Bearer ${token}` };

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set(auth);
    expect(me.status).toBe(200);

    const badChange = await request(app.getHttpServer())
      .post("/api/v1/auth/change-password")
      .set(auth)
      .send({ currentPassword: "wrong-password", newPassword: NEW_PASSWORD });
    expect(badChange.status).not.toBe(403);

    // v0.8.5 step 1 — the refresh token travels only as the cookie login
    // set, never a body field; CsrfHeaderGuard now also applies here.
    const cookie = findSetCookie(login, "refreshToken")!;
    const logout = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set(auth)
      .set("Cookie", asCookieHeader(cookie))
      .set(CSRF_HEADER);
    expect(logout.status).not.toBe(403);
  });

  it("rejects the wrong current password", async () => {
    const login = await loginAsNewTeacher();
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: "definitely-wrong", newPassword: NEW_PASSWORD });
    expect(response.status).toBe(401);
  });

  it("rejects a new password under 8 characters", async () => {
    const login = await loginAsNewTeacher();
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: SEED_PASSWORD, newPassword: "short" });
    expect(response.status).toBe(400);
  });

  it("changes the password, clears the flag, and reissues tokens that immediately work everywhere", async () => {
    const login = await loginAsNewTeacher();
    const changeResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: SEED_PASSWORD, newPassword: NEW_PASSWORD });

    expect(changeResponse.status).toBe(200);
    expect(typeof changeResponse.body.accessToken).toBe("string");
    // v0.8.5 step 1 — change-password reissues a token pair too; its
    // refresh token moves to the cookie exactly like login/refresh.
    expect(changeResponse.body).not.toHaveProperty("refreshToken");
    expect(findSetCookie(changeResponse, "refreshToken")).toBeDefined();
    const newToken = changeResponse.body.accessToken;

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Authorization", `Bearer ${newToken}`);
    expect(me.body.mustChangePassword).toBe(false);

    // TEACHER already has read access to /students — no longer 403'd by
    // the password-change guard now that the flag is cleared.
    const students = await request(app.getHttpServer())
      .get("/api/v1/students")
      .set("Authorization", `Bearer ${newToken}`);
    expect(students.status).toBe(200);

    // Logging in again with the NEW password works normally.
    const reLogin = await loginAsNewTeacher(NEW_PASSWORD);
    expect(reLogin.status).toBe(200);
    expect(reLogin.body.user.mustChangePassword).toBe(false);
  });

  it("rejects unauthenticated change-password requests", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: SEED_PASSWORD, newPassword: NEW_PASSWORD });
    expect(response.status).toBe(401);
  });
});
