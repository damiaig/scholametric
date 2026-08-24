import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { PrismaService } from "../src/prisma/prisma.service";

// Matches prisma/seed.ts SEED_PASSWORD — seeded demo credentials, not a real secret.
const SEED_PASSWORD = "Passw0rd!";
const SUNRISE_ADMIN_EMAIL = "admin@sunrise.test";
const SUNRISE_SLUG = "sunrise";
const HILLCREST_SLUG = "hillcrest";

// Low bcrypt cost — test-only fixtures, same convention as
// teacher-visibility.e2e-spec.ts's scratch teacher.
const SCRATCH_BCRYPT_COST = 4;

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminUserId: string;
  let sunriseSchoolId: string;

  // v0.6 step 2: a real STUDENT portal account, for the enumeration-parity
  // and cross-school tests — a real username with a known password.
  let scratchStudentUsername: string;
  let scratchStudentId: string;
  let scratchStudentUserId: string;
  const SCRATCH_STUDENT_PASSWORD = "483920";

  // A second, separate STUDENT account still flagged mustChangePassword —
  // kept independent of the one above so the enumeration tests never
  // observe a password this test later changes.
  let mustChangeStudentUsername: string;
  let mustChangeStudentId: string;
  let mustChangeStudentUserId: string;
  const MUST_CHANGE_TEMP_PASSWORD = "719204";

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const admin = await prisma.user.findFirstOrThrow({ where: { email: SUNRISE_ADMIN_EMAIL } });
    adminUserId = admin.id;
    sunriseSchoolId = admin.schoolId;

    async function makeStudentAccount(admissionSuffix: string, username: string, password: string, mustChangePassword: boolean) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseSchoolId,
          admissionNumber: `SUN/2026/E2EAUTH-${admissionSuffix}`,
          firstName: "E2E",
          lastName: "AuthFixture",
          gender: "MALE",
          dateOfBirth: new Date("2014-01-01"),
          guardianName: "x",
          guardianPhone: "+2348000000099",
        },
      });
      const passwordHash = await bcrypt.hash(password, SCRATCH_BCRYPT_COST);
      const user = await prisma.user.create({
        data: {
          schoolId: sunriseSchoolId,
          role: "STUDENT",
          username,
          studentId: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          passwordHash,
          mustChangePassword,
        },
      });
      return { studentId: student.id, userId: user.id };
    }

    scratchStudentUsername = "E2EAUTHSTUDENT1";
    const scratch = await makeStudentAccount("1", scratchStudentUsername, SCRATCH_STUDENT_PASSWORD, false);
    scratchStudentId = scratch.studentId;
    scratchStudentUserId = scratch.userId;

    mustChangeStudentUsername = "E2EAUTHSTUDENT2";
    const mustChange = await makeStudentAccount("2", mustChangeStudentUsername, MUST_CHANGE_TEMP_PASSWORD, true);
    mustChangeStudentId = mustChange.studentId;
    mustChangeStudentUserId = mustChange.userId;
  });

  afterAll(async () => {
    // Keep the local dev DB tidy across repeated test runs. audit_logs
    // (written by the change-password call above) FKs to users, so it
    // must go first.
    const scratchUserIds = [adminUserId, scratchStudentUserId, mustChangeStudentUserId];
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: scratchUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: scratchUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [scratchStudentUserId, mustChangeStudentUserId] } } });
    await prisma.student.deleteMany({ where: { id: { in: [scratchStudentId, mustChangeStudentId] } } });
    await app.close();
  });

  const login = (overrides: Partial<{ identifier: string; password: string; schoolSlug: string }> = {}) =>
    request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        identifier: SUNRISE_ADMIN_EMAIL,
        password: SEED_PASSWORD,
        schoolSlug: SUNRISE_SLUG,
        ...overrides,
      });

  describe("POST /auth/login", () => {
    it("logs in with valid credentials", async () => {
      const response = await login();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: expect.objectContaining({
          email: SUNRISE_ADMIN_EMAIL,
          role: "SCHOOL_ADMIN",
          school: expect.objectContaining({ slug: SUNRISE_SLUG }),
        }),
      });
    });

    // v0.6 step 2 (SPEC_V0.6.md §2.2): STUDENT/PARENT log in with the SAME
    // field, a provisioned username instead of email.
    it("logs in a STUDENT portal account by username", async () => {
      const response = await login({ identifier: scratchStudentUsername, password: SCRATCH_STUDENT_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: expect.objectContaining({
          email: null,
          role: "STUDENT",
          school: expect.objectContaining({ slug: SUNRISE_SLUG }),
        }),
      });
    });

    // The core anti-enumeration guarantee, extended to usernames: no
    // response (status, body shape, or message) may reveal WHICH part of
    // the attempt was wrong, or even whether the identifier exists at all
    // — for staff email or portal username alike.
    it("returns an IDENTICAL generic error for: unknown username, wrong password on a real username, unknown email, and valid-creds-wrong-school", async () => {
      const [unknownUsername, wrongPasswordRealUsername, unknownEmail, validCredsWrongSchool] = await Promise.all([
        login({ identifier: "NOSUCHUSER1" }),
        login({ identifier: scratchStudentUsername, password: "wrong-password" }),
        login({ identifier: "nobody@sunrise.test" }),
        // A REAL username + REAL password for Sunrise, submitted against
        // Hillcrest's slug — schoolId-scoped lookup never resolves it
        // there, so this must fail identically to every other case, not
        // with a distinguishable "wrong school" signal (that would leak
        // cross-tenant information login is specifically designed not to).
        login({ identifier: scratchStudentUsername, password: SCRATCH_STUDENT_PASSWORD, schoolSlug: HILLCREST_SLUG }),
      ]);

      const all = [unknownUsername, wrongPasswordRealUsername, unknownEmail, validCredsWrongSchool];
      for (const response of all) {
        expect(response.status).toBe(401);
      }

      const shapes = all.map((r) => ({ statusCode: r.body.statusCode, message: r.body.message, error: r.body.error }));
      for (const shape of shapes.slice(1)) {
        expect(shape).toEqual(shapes[0]);
      }
    });
  });

  describe("GET /auth/me", () => {
    it("returns the profile for a valid access token", async () => {
      const { body } = await login();

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${body.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          email: SUNRISE_ADMIN_EMAIL,
          role: "SCHOOL_ADMIN",
          school: expect.objectContaining({ slug: SUNRISE_SLUG }),
        }),
      );
    });

    it("rejects an expired access token", async () => {
      const jwtService = app.get(JwtService);
      const configService = app.get(ConfigService);
      const expiredToken = await jwtService.signAsync(
        { sub: adminUserId, schoolId: "irrelevant", role: "SCHOOL_ADMIN" },
        { secret: configService.getOrThrow<string>("JWT_ACCESS_SECRET"), expiresIn: "-10s" },
      );

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });

    it("rejects a garbage token", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer not-a-real-token");

      expect(response.status).toBe(401);
    });
  });

  it("401s on a protected endpoint with no token at all (guard is truly global)", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/auth/me");
    expect(response.status).toBe(401);
  });

  // v0.6 step 2 — the forced-password-change hard block, proven server-side
  // against a REAL protected route, not a UI assertion. Reuses the existing
  // global PasswordChangeRequiredGuard wholesale (SPEC_V0.3.md §2) — no fork
  // for portal accounts.
  describe("forced-password-change hard block (a mustChangePassword STUDENT account)", () => {
    it("blocks a real protected route, allows only change-password/me/logout, then the block's REASON is gone after changing", async () => {
      const loginResponse = await login({ identifier: mustChangeStudentUsername, password: MUST_CHANGE_TEMP_PASSWORD });
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.user.mustChangePassword).toBe(true);
      const staleToken = loginResponse.body.accessToken as string;

      // A real protected route — GET /students — 403s with the
      // password-change guard's message, not a role/RBAC message.
      const blockedStudents = await request(app.getHttpServer())
        .get("/api/v1/students")
        .set("Authorization", `Bearer ${staleToken}`);
      expect(blockedStudents.status).toBe(403);
      expect(blockedStudents.body.message).toBe("You must change your password before continuing.");

      // The three explicitly-exempted routes still work with the stale token.
      const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Authorization", `Bearer ${staleToken}`);
      expect(me.status).toBe(200);

      const changePassword = await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${staleToken}`)
        .send({ currentPassword: MUST_CHANGE_TEMP_PASSWORD, newPassword: "a-new-password-8+chars" });
      expect(changePassword.status).toBe(200);
      const freshToken = changePassword.body.accessToken as string;

      // Retry the same route with the FRESH token (change-password reissues
      // one, exactly like staff — mustChangePassword:false is now baked
      // into its own claims). STUDENT still isn't @Roles()-authorized on
      // /students, so this still 403s — but via RolesGuard's "Forbidden",
      // never the password-change message again. That message-level
      // distinction IS the proof the block's REASON changed, not just that
      // "something still 403s."
      const afterChange = await request(app.getHttpServer())
        .get("/api/v1/students")
        .set("Authorization", `Bearer ${freshToken}`);
      expect(afterChange.status).toBe(403);
      expect(afterChange.body.message).not.toBe("You must change your password before continuing.");
      expect(afterChange.body.message).toBe("Forbidden");
    });
  });

  describe("refresh rotation and reuse detection", () => {
    it("rotates on use, kills the old token, and revokes the whole family on reuse", async () => {
      const loginResponse = await login();
      const refreshToken1 = loginResponse.body.refreshToken as string;

      const firstRefresh = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: refreshToken1 });
      expect(firstRefresh.status).toBe(200);
      const refreshToken2 = firstRefresh.body.refreshToken as string;
      expect(refreshToken2).not.toBe(refreshToken1);

      // refreshToken1 is dead after use.
      const reuseAttempt = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: refreshToken1 });
      expect(reuseAttempt.status).toBe(401);

      // Reuse revoked the whole family — refreshToken2 (the newest) is dead too.
      const secondTokenAttempt = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: refreshToken2 });
      expect(secondTokenAttempt.status).toBe(401);
    });
  });

  describe("POST /auth/logout", () => {
    it("revokes the presented refresh token; refresh after logout fails", async () => {
      const loginResponse = await login();
      const { accessToken, refreshToken } = loginResponse.body;

      const logoutResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ refreshToken });
      expect(logoutResponse.status).toBe(200);

      const refreshAfterLogout = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken });
      expect(refreshAfterLogout.status).toBe(401);
    });
  });
});
