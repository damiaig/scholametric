import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, GuardianRelationship, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// SPEC_V0.6.md §5 step 5 — reset-and-reissue. Temp passwords are bcrypt-
// hashed at rest with no plaintext ever recoverable (step 1), so "print a
// slip later" for an already-provisioned account means generating a FRESH
// temp password (reissue). This suite proves: a single reissue behaves
// exactly like fresh provisioning at login (old password dies, new one
// works, forced-change hard-blocks the same way), the audit trail never
// carries a password, and the class-arm batch's default-skip/force/dedup
// semantics the user locked in on approval.
describe("Portal account reset-and-reissue (e2e) — SPEC_V0.6.md §5 step 5", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  // Shared across every role-boundary test (single + batch) so the suite
  // doesn't hammer POST /auth/login — it's throttled to 10/min per IP
  // (auth.controller.ts's @Throttle on login), a real anti-brute-force
  // guarantee this suite must respect rather than route around.
  let sunriseStudentToken: string;
  let sunriseParentToken: string;
  let sunriseId: string;
  let sunriseSessionId: string;

  const createdStudentIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdClassArmIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const TEST_BCRYPT_COST = 4; // low cost — test-only, matches me-parent.e2e-spec.ts's convention

  async function makeStudent(admissionSuffix: string, firstName: string): Promise<string> {
    const student = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: `E2E-REISSUE/${admissionSuffix}`,
        firstName,
        lastName: "Reissue",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2013-01-01"),
        guardianName: "E2E Guardian",
        guardianPhone: `+23480${admissionSuffix.padStart(8, "0")}`,
      },
    });
    createdStudentIds.push(student.id);
    return student.id;
  }

  async function enroll(studentId: string, classArmId: string): Promise<void> {
    await prisma.studentEnrollment.create({
      data: { schoolId: sunriseId, studentId, classArmId, sessionId: sunriseSessionId },
    });
  }

  async function makeGuardian(firstName: string, phoneSuffix: string): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: { schoolId: sunriseId, firstName, lastName: "Reissue", phone: `+23481${phoneSuffix}` },
    });
    createdGuardianIds.push(guardian.id);
    return guardian.id;
  }

  async function linkGuardian(studentId: string, guardianId: string): Promise<void> {
    await prisma.studentGuardian.create({
      data: { schoolId: sunriseId, studentId, guardianId, relationship: GuardianRelationship.OTHER, isPrimary: true },
    });
  }

  async function makePortalUser(
    role: "STUDENT" | "PARENT",
    username: string,
    link: { studentId?: string; guardianId?: string },
    mustChangePassword: boolean,
    password = "InitialPassw0rd!",
  ): Promise<string> {
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_COST);
    const user = await prisma.user.create({
      data: {
        schoolId: sunriseId,
        role: role as UserRole,
        username,
        studentId: link.studentId,
        guardianId: link.guardianId,
        firstName: "E2E",
        lastName: "Reissue",
        passwordHash,
        mustChangePassword,
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  function reissue(id: string, token: string) {
    return request(app.getHttpServer()).post(`/api/v1/portal-accounts/${id}/reissue`).set(auth(token));
  }

  function reissueForClassArm(classArmId: string, token: string, body?: { force?: boolean }) {
    return request(app.getHttpServer())
      .post(`/api/v1/portal-accounts/class-arms/${classArmId}/reissue`)
      .set(auth(token))
      .send(body ?? {});
  }

  function login(identifier: string, password: string) {
    return request(app.getHttpServer()).post("/api/v1/auth/login").send({ identifier, password, schoolSlug: "sunrise" });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const session = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = session.id;

    const roleStudentId = await makeStudent("RoleBoundary", "RoleBoundary");
    await makePortalUser("STUDENT", "E2EREISSUEROLESTUDENT", { studentId: roleStudentId }, false, SEED_PASSWORD);
    sunriseStudentToken = await loginAs(app, "E2EREISSUEROLESTUDENT", "sunrise");

    const roleGuardianId = await makeGuardian("RoleBoundary", "900099");
    await makePortalUser("PARENT", "E2EREISSUEROLEPARENT", { guardianId: roleGuardianId }, false, SEED_PASSWORD);
    sunriseParentToken = await loginAs(app, "E2EREISSUEROLEPARENT", "sunrise");
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.studentGuardian.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.guardian.deleteMany({ where: { id: { in: createdGuardianIds } } });
    for (const classArmId of createdClassArmIds) {
      await prisma.classArm.delete({ where: { id: classArmId } });
    }
    await app.close();
  });

  describe("POST /portal-accounts/:id/reissue", () => {
    it("sets mustChangePassword=true, the OLD password no longer logs in (generic 401), the NEW one does", async () => {
      const studentId = await makeStudent("S1", "Single");
      const userId = await makePortalUser("STUDENT", "E2EREISSUESINGLE1", { studentId }, false, "OldPassw0rd!");

      const response = await reissue(userId, sunriseAdminToken);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(userId);
      expect(response.body.mustChangePassword).toBe(true);
      expect(typeof response.body.tempPassword).toBe("string");
      expect(response.body.tempPassword).toMatch(/^[0-9]{6}$/);

      const oldLogin = await login("E2EREISSUESINGLE1", "OldPassw0rd!");
      expect(oldLogin.status).toBe(401);

      const newLogin = await login("E2EREISSUESINGLE1", response.body.tempPassword);
      expect(newLogin.status).toBe(200);
      expect(newLogin.body.user.mustChangePassword).toBe(true);
    });

    it("a reissued account hits the exact same forced-password-change hard block as fresh provisioning", async () => {
      const studentId = await makeStudent("S2", "Blocked");
      const userId = await makePortalUser("STUDENT", "E2EREISSUEBLOCKED1", { studentId }, false, "OldPassw0rd!");

      const response = await reissue(userId, sunriseAdminToken);
      const loginResponse = await login("E2EREISSUEBLOCKED1", response.body.tempPassword);
      expect(loginResponse.status).toBe(200);

      const blocked = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .set(auth(loginResponse.body.accessToken));
      expect(blocked.status).toBe(403);
      expect(blocked.headers["x-password-change-required"]).toBe("true");
    });

    it("revokes active refresh tokens — the old session dies immediately, not just the password", async () => {
      const studentId = await makeStudent("S3", "Revoked");
      const userId = await makePortalUser("STUDENT", "E2EREISSUEREVOKED1", { studentId }, false, "OldPassw0rd!");

      const oldLogin = await login("E2EREISSUEREVOKED1", "OldPassw0rd!");
      expect(oldLogin.status).toBe(200);

      await reissue(userId, sunriseAdminToken);

      const refreshResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: oldLogin.body.refreshToken });
      expect(refreshResponse.status).toBe(401);
    });

    it("the audit entry for a single reissue contains NO tempPassword/password field", async () => {
      const studentId = await makeStudent("S4", "Audited");
      const userId = await makePortalUser("STUDENT", "E2EREISSUEAUDITED1", { studentId }, false);

      await reissue(userId, sunriseAdminToken);

      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { entityType: "portalAccount", entityId: userId, action: "portalAccount.reissue" },
      });
      const serialized = JSON.stringify(entry.metadata ?? {});
      expect(serialized.toLowerCase()).not.toContain("password");
    });

    it("@Roles: 403 for TEACHER", async () => {
      const studentId = await makeStudent("S5", "Roles");
      const userId = await makePortalUser("STUDENT", "E2EREISSUEROLES1", { studentId }, false);
      const response = await reissue(userId, sunriseTeacherToken);
      expect(response.status).toBe(403);
    });

    it("@Roles: 403 for STUDENT", async () => {
      const studentId = await makeStudent("S6", "RolesStudent");
      const userId = await makePortalUser("STUDENT", "E2EREISSUEROLES2", { studentId }, false);
      const response = await reissue(userId, sunriseStudentToken);
      expect(response.status).toBe(403);
    });

    it("@Roles: 403 for PARENT", async () => {
      const guardianId = await makeGuardian("Roles", "900001");
      const userId = await makePortalUser("PARENT", "E2EREISSUEROLES3", { guardianId }, false);
      const response = await reissue(userId, sunriseParentToken);
      expect(response.status).toBe(403);
    });

    it("cross-tenant: a Hillcrest admin reissuing a Sunrise account 404s", async () => {
      const studentId = await makeStudent("S7", "CrossTenant");
      const userId = await makePortalUser("STUDENT", "E2EREISSUECROSSTEN1", { studentId }, false);
      const response = await reissue(userId, hillcrestAdminToken);
      expect(response.status).toBe(404);
    });

    it("401 unauthenticated", async () => {
      const studentId = await makeStudent("S8", "Unauth");
      const userId = await makePortalUser("STUDENT", "E2EREISSUEUNAUTH1", { studentId }, false);
      const response = await request(app.getHttpServer()).post(`/api/v1/portal-accounts/${userId}/reissue`);
      expect(response.status).toBe(401);
    });
  });

  describe("POST /portal-accounts/class-arms/:classArmId/reissue", () => {
    let classArmId: string;
    let studentAAccountId: string;
    let studentBAccountId: string;
    let studentCAccountId: string;
    let studentCPasswordHashBefore: string;
    let notProvisionedStudentId: string;
    let parentABAccountId: string;
    let parentCAccountId: string;

    beforeAll(async () => {
      const jss3 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 3" } });
      classArmId = (
        await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss3.id, name: `E2E-Reissue-${Date.now()}` } })
      ).id;
      createdClassArmIds.push(classArmId);

      // A and B are siblings sharing one guardian/parent account — proves
      // dedup (the shared parent must appear exactly once in a batch, not
      // once per child).
      const studentAId = await makeStudent("BatchA", "Amaka");
      const studentBId = await makeStudent("BatchB", "Bola");
      await enroll(studentAId, classArmId);
      await enroll(studentBId, classArmId);
      const guardianABId = await makeGuardian("SharedParent", "900010");
      await linkGuardian(studentAId, guardianABId);
      await linkGuardian(studentBId, guardianABId);
      studentAAccountId = await makePortalUser("STUDENT", "E2EBATCHSTUDENTA1", { studentId: studentAId }, true);
      studentBAccountId = await makePortalUser("STUDENT", "E2EBATCHSTUDENTB1", { studentId: studentBId }, true);
      parentABAccountId = await makePortalUser("PARENT", "E2EBATCHPARENTAB1", { guardianId: guardianABId }, true);

      // C already changed their password (mustChangePassword=false) — the
      // default-skip case. Own separate guardian/parent, also already
      // changed.
      const studentCId = await makeStudent("BatchC", "Chidi");
      await enroll(studentCId, classArmId);
      const guardianCId = await makeGuardian("AlreadyChanged", "900011");
      await linkGuardian(studentCId, guardianCId);
      studentCAccountId = await makePortalUser("STUDENT", "E2EBATCHSTUDENTC1", { studentId: studentCId }, false, "AlreadyChangedPassw0rd!");
      parentCAccountId = await makePortalUser("PARENT", "E2EBATCHPARENTC1", { guardianId: guardianCId }, false, "AlreadyChangedPassw0rd!");
      studentCPasswordHashBefore = (await prisma.user.findUniqueOrThrow({ where: { id: studentCAccountId } })).passwordHash;

      // D is on the roster but has no portal account at all yet.
      notProvisionedStudentId = await makeStudent("BatchD", "Dubem");
      await enroll(notProvisionedStudentId, classArmId);
    });

    it("default (force omitted): reissues never-logged-in accounts, dedups the shared parent, skips already-changed and not-provisioned accounts with a reason — never silently dropping either", async () => {
      const response = await reissueForClassArm(classArmId, sunriseAdminToken);
      expect(response.status).toBe(200);
      expect(response.body.classArmId).toBe(classArmId);

      const reissuedIds = response.body.reissued.map((r: { id: string }) => r.id);
      expect(reissuedIds.sort()).toEqual([studentAAccountId, studentBAccountId, parentABAccountId].sort());
      // Dedup: the shared parent appears exactly once.
      expect(reissuedIds.filter((id: string) => id === parentABAccountId)).toHaveLength(1);

      const skipped = response.body.skipped as { id: string; reason: string }[];
      const alreadyChanged = skipped.filter((s) => s.reason === "already_changed_password").map((s) => s.id);
      expect(alreadyChanged.sort()).toEqual([studentCAccountId, parentCAccountId].sort());
      const notProvisioned = skipped.filter((s) => s.reason === "not_provisioned").map((s) => s.id);
      expect(notProvisioned).toEqual([notProvisionedStudentId]);

      // C's account is untouched — proves "skip" really means skip, not
      // reset (passwordHash/mustChangePassword byte-for-byte unchanged).
      const cAccount = await prisma.user.findUniqueOrThrow({ where: { id: studentCAccountId } });
      expect(cAccount.mustChangePassword).toBe(false);
      expect(cAccount.passwordHash).toBe(studentCPasswordHashBefore);
    });

    it("force:true includes the already-changed accounts too, still skipping not_provisioned", async () => {
      const response = await reissueForClassArm(classArmId, sunriseAdminToken, { force: true });
      expect(response.status).toBe(200);

      const reissuedIds = response.body.reissued.map((r: { id: string }) => r.id);
      expect(reissuedIds).toEqual(
        expect.arrayContaining([studentAAccountId, studentBAccountId, parentABAccountId, studentCAccountId, parentCAccountId]),
      );

      const skipped = response.body.skipped as { id: string; reason: string }[];
      expect(skipped.map((s) => s.reason)).toEqual(["not_provisioned"]);
      expect(skipped[0].id).toBe(notProvisionedStudentId);

      // C's hash actually changed and mustChangePassword is re-armed —
      // force really did reset it, not just report it as reissued.
      const cAccount = await prisma.user.findUniqueOrThrow({ where: { id: studentCAccountId } });
      expect(cAccount.passwordHash).not.toBe(studentCPasswordHashBefore);
      expect(cAccount.mustChangePassword).toBe(true);
    });

    it("@Roles: 403 for TEACHER", async () => {
      const response = await reissueForClassArm(classArmId, sunriseTeacherToken);
      expect(response.status).toBe(403);
    });

    it("@Roles: 403 for STUDENT", async () => {
      const response = await reissueForClassArm(classArmId, sunriseStudentToken);
      expect(response.status).toBe(403);
    });

    it("@Roles: 403 for PARENT", async () => {
      const response = await reissueForClassArm(classArmId, sunriseParentToken);
      expect(response.status).toBe(403);
    });

    it("cross-tenant: a Hillcrest admin reissuing a Sunrise class arm 404s", async () => {
      const response = await reissueForClassArm(classArmId, hillcrestAdminToken);
      expect(response.status).toBe(404);
    });

    it("401 unauthenticated", async () => {
      const response = await request(app.getHttpServer()).post(`/api/v1/portal-accounts/class-arms/${classArmId}/reissue`);
      expect(response.status).toBe(401);
    });
  });
});
