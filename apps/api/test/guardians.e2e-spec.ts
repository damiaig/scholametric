import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Guardians (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let sunriseSchoolId: string;
  let sunriseClassArmId: string;
  const createdStudentIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseSchoolId = sunrise.id;

    const sunriseArm = await prisma.classArm.findFirstOrThrow({
      where: { schoolId: sunriseSchoolId, name: "A", classLevel: { name: "JSS 1" } },
    });
    sunriseClassArmId = sunriseArm.id;
  });

  afterAll(async () => {
    const ids = createdStudentIds.filter((id): id is string => Boolean(id));
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    const guardianIds = (
      await prisma.studentGuardian.findMany({ where: { studentId: { in: ids } }, select: { guardianId: true } })
    ).map((link) => link.guardianId);
    await prisma.studentGuardian.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.guardian.deleteMany({ where: { id: { in: guardianIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.student.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createStudent(
    token: string,
    guardians: Record<string, unknown>[],
    classArmId = sunriseClassArmId,
  ): Promise<{ id: string; [key: string]: unknown }> {
    const suffix = randomUUID().slice(0, 8);
    const response = await request(app.getHttpServer())
      .post("/api/v1/students")
      .set(auth(token))
      .send({
        firstName: "Test",
        lastName: `Student-${suffix}`,
        gender: "MALE",
        dateOfBirth: "2012-05-01",
        guardians,
        classArmId,
      });
    if (response.status !== 201) {
      throw new Error(`Student creation failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    createdStudentIds.push(response.body.id);
    return response.body;
  }

  describe("GET /students/:id/guardians", () => {
    it("returns links with relationship + isPrimary, primary first", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "Mother", lastName: "One", phone: "+2348010000001", relationship: "MOTHER" },
        { firstName: "Father", lastName: "One", phone: "+2348010000002", relationship: "FATHER" },
      ]);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].isPrimary).toBe(true);
      expect(response.body[0].firstName).toBe("Mother");
      expect(response.body[0].relationship).toBe("MOTHER");
      expect(response.body[1].isPrimary).toBe(false);
    });
  });

  describe("POST /students/:id/guardians", () => {
    it("create-new mode: adding to a student who already has a primary never steals it", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "Only", lastName: "Guardian", phone: "+2348010000003", relationship: "MOTHER" },
      ]);

      const add = await request(app.getHttpServer())
        .post(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken))
        .send({ firstName: "Second", lastName: "Guardian", phone: "+2348010000004", relationship: "AUNT" });
      expect(add.status).toBe(201);
      expect(add.body.isPrimary).toBe(false);

      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      expect(links.body.filter((g: { isPrimary: boolean }) => g.isPrimary)).toHaveLength(1);
      expect(links.body.find((g: { isPrimary: boolean }) => g.isPrimary).firstName).toBe("Only");

      const auditRow = await prisma.auditLog.findFirst({
        where: { entityId: add.body.id, action: "studentGuardian.add" },
      });
      expect(auditRow).not.toBeNull();
    });

    it("first guardian ever added to a student (via standalone endpoint) becomes primary", async () => {
      // A student created with a guardian, then that link force-removed and
      // re-added, to exercise "first ever" through this endpoint specifically.
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "Temp", lastName: "Guardian", phone: "+2348010000005", relationship: "MOTHER" },
      ]);
      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const guardianId = links.body[0].guardianId;

      await request(app.getHttpServer())
        .delete(`/api/v1/students/${student.id}/guardians/${guardianId}?force=true`)
        .set(auth(sunriseAdminToken));

      const add = await request(app.getHttpServer())
        .post(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken))
        .send({ firstName: "Fresh", lastName: "Guardian", phone: "+2348010000006", relationship: "MOTHER" });
      expect(add.status).toBe(201);
      expect(add.body.isPrimary).toBe(true);
    });

    it("sibling case: link-existing by guardianId, and a PATCH to the shared guardian reflects on both students", async () => {
      const studentA = await createStudent(sunriseAdminToken, [
        { firstName: "Shared", lastName: "Parent", phone: "+2348010000007", relationship: "FATHER" },
      ]);
      const linksA = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentA.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const sharedGuardianId = linksA.body[0].guardianId;

      const studentB = await createStudent(sunriseAdminToken, [
        { firstName: "Placeholder", lastName: "X", phone: "+2348010000008", relationship: "OTHER" },
      ]);
      const link = await request(app.getHttpServer())
        .post(`/api/v1/students/${studentB.id}/guardians`)
        .set(auth(sunriseAdminToken))
        .send({ guardianId: sharedGuardianId, relationship: "UNCLE" });
      expect(link.status).toBe(201);
      expect(link.body.guardianId).toBe(sharedGuardianId);
      expect(link.body.relationship).toBe("UNCLE");

      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/guardians/${sharedGuardianId}`)
        .set(auth(sunriseAdminToken))
        .send({ phone: "+2348099999999" });
      expect(patch.status).toBe(200);
      expect(patch.body.phone).toBe("+2348099999999");

      const [afterA, afterB] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/v1/students/${studentA.id}/guardians`)
          .set(auth(sunriseAdminToken)),
        request(app.getHttpServer())
          .get(`/api/v1/students/${studentB.id}/guardians`)
          .set(auth(sunriseAdminToken)),
      ]);
      expect(afterA.body.find((g: { guardianId: string }) => g.guardianId === sharedGuardianId).phone).toBe(
        "+2348099999999",
      );
      expect(afterB.body.find((g: { guardianId: string }) => g.guardianId === sharedGuardianId).phone).toBe(
        "+2348099999999",
      );
    });

    it("400s when neither guardianId nor firstName/lastName/phone are provided", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "A", lastName: "B", phone: "+2348010000009", relationship: "MOTHER" },
      ]);
      const response = await request(app.getHttpServer())
        .post(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken))
        .send({ relationship: "OTHER" });
      expect(response.status).toBe(400);
    });

    it("404s linking a guardianId that belongs to a different school", async () => {
      const sunriseStudent = await createStudent(sunriseAdminToken, [
        { firstName: "A", lastName: "B", phone: "+2348010000010", relationship: "MOTHER" },
      ]);
      const hillcrestArm = await prisma.classArm.findFirstOrThrow({
        where: { school: { slug: "hillcrest" } },
      });
      const hillcrestStudent = await createStudent(
        hillcrestAdminToken,
        [{ firstName: "H", lastName: "Guardian", phone: "+2348010000011", relationship: "MOTHER" }],
        hillcrestArm.id,
      );
      const hillcrestLinks = await request(app.getHttpServer())
        .get(`/api/v1/students/${hillcrestStudent.id}/guardians`)
        .set(auth(hillcrestAdminToken));
      const hillcrestGuardianId = hillcrestLinks.body[0].guardianId;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/students/${sunriseStudent.id}/guardians`)
        .set(auth(sunriseAdminToken))
        .send({ guardianId: hillcrestGuardianId, relationship: "OTHER" });
      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /guardians/:id", () => {
    it("404s across tenants", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "A", lastName: "B", phone: "+2348010000012", relationship: "MOTHER" },
      ]);
      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const guardianId = links.body[0].guardianId;

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/guardians/${guardianId}`)
        .set(auth(hillcrestAdminToken))
        .send({ phone: "+2348000000000" });
      expect(response.status).toBe(404);
    });

    it("403s for TEACHER", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "A", lastName: "B", phone: "+2348010000013", relationship: "MOTHER" },
      ]);
      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const guardianId = links.body[0].guardianId;

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/guardians/${guardianId}`)
        .set(auth(sunriseTeacherToken))
        .send({ phone: "+2348000000000" });
      expect(response.status).toBe(403);
    });
  });

  describe("DELETE /students/:id/guardians/:guardianId", () => {
    it("409s unlinking the primary while other links exist", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "Primary", lastName: "One", phone: "+2348010000014", relationship: "MOTHER" },
        { firstName: "Secondary", lastName: "Two", phone: "+2348010000015", relationship: "FATHER" },
      ]);
      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const primaryGuardianId = links.body.find((g: { isPrimary: boolean }) => g.isPrimary).guardianId;

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/students/${student.id}/guardians/${primaryGuardianId}`)
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(409);
    });

    it("requires ?force=true to remove the student's only guardian, and soft-deletes the orphaned guardian", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "Only", lastName: "One", phone: "+2348010000016", relationship: "MOTHER" },
      ]);
      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const guardianId = links.body[0].guardianId;

      const withoutForce = await request(app.getHttpServer())
        .delete(`/api/v1/students/${student.id}/guardians/${guardianId}`)
        .set(auth(sunriseAdminToken));
      expect(withoutForce.status).toBe(400);

      const withForce = await request(app.getHttpServer())
        .delete(`/api/v1/students/${student.id}/guardians/${guardianId}?force=true`)
        .set(auth(sunriseAdminToken));
      expect(withForce.status).toBe(200);

      const guardian = await prisma.guardian.findUniqueOrThrow({ where: { id: guardianId } });
      expect(guardian.deletedAt).not.toBeNull();
    });

    it("does not soft-delete a guardian still linked to another (sibling) student", async () => {
      const studentA = await createStudent(sunriseAdminToken, [
        { firstName: "Shared", lastName: "Sibling", phone: "+2348010000017", relationship: "FATHER" },
      ]);
      const linksA = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentA.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const sharedGuardianId = linksA.body[0].guardianId;

      const studentB = await createStudent(sunriseAdminToken, [
        { firstName: "Placeholder", lastName: "X", phone: "+2348010000018", relationship: "OTHER" },
      ]);
      await request(app.getHttpServer())
        .post(`/api/v1/students/${studentB.id}/guardians`)
        .set(auth(sunriseAdminToken))
        .send({ guardianId: sharedGuardianId, relationship: "UNCLE" });

      await request(app.getHttpServer())
        .delete(`/api/v1/students/${studentA.id}/guardians/${sharedGuardianId}?force=true`)
        .set(auth(sunriseAdminToken));

      const guardian = await prisma.guardian.findUniqueOrThrow({ where: { id: sharedGuardianId } });
      expect(guardian.deletedAt).toBeNull();
    });

    it("404s across tenants", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "A", lastName: "B", phone: "+2348010000019", relationship: "MOTHER" },
      ]);
      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const guardianId = links.body[0].guardianId;

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/students/${student.id}/guardians/${guardianId}?force=true`)
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(404);
    });

    it("403s for TEACHER", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "A", lastName: "B", phone: "+2348010000020", relationship: "MOTHER" },
      ]);
      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const guardianId = links.body[0].guardianId;

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/students/${student.id}/guardians/${guardianId}?force=true`)
        .set(auth(sunriseTeacherToken));
      expect(response.status).toBe(403);
    });
  });

  describe("PUT /students/:id/guardians/:guardianId/primary", () => {
    it("swaps primary atomically: never zero, never two", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "Original", lastName: "Primary", phone: "+2348010000021", relationship: "MOTHER" },
        { firstName: "New", lastName: "Primary", phone: "+2348010000022", relationship: "FATHER" },
      ]);
      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const newPrimaryGuardianId = links.body.find(
        (g: { isPrimary: boolean }) => !g.isPrimary,
      ).guardianId;

      const swap = await request(app.getHttpServer())
        .put(`/api/v1/students/${student.id}/guardians/${newPrimaryGuardianId}/primary`)
        .set(auth(sunriseAdminToken));
      expect(swap.status).toBe(200);
      expect(swap.body.isPrimary).toBe(true);

      const after = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const primaries = after.body.filter((g: { isPrimary: boolean }) => g.isPrimary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0].guardianId).toBe(newPrimaryGuardianId);

      const auditRow = await prisma.auditLog.findFirst({
        where: { entityId: swap.body.id, action: "studentGuardian.setPrimary" },
      });
      expect(auditRow).not.toBeNull();
    });

    it("under concurrent swap attempts between the same two guardians, always ends with exactly one primary", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "GuardianA", lastName: "X", phone: "+2348010000023", relationship: "MOTHER" },
        { firstName: "GuardianB", lastName: "Y", phone: "+2348010000024", relationship: "FATHER" },
      ]);
      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const [guardianA, guardianB] = links.body.map((g: { guardianId: string }) => g.guardianId);

      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          request(app.getHttpServer())
            .put(`/api/v1/students/${student.id}/guardians/${i % 2 === 0 ? guardianA : guardianB}/primary`)
            .set(auth(sunriseAdminToken)),
        ),
      );
      // Every concurrent swap must complete cleanly (200) — a stale-read
      // race here would surface as a 500 (unique constraint violation),
      // not just a wrong final state.
      expect(responses.map((r) => r.status)).toEqual(Array(6).fill(200));

      const finalLinks = await prisma.studentGuardian.findMany({ where: { studentId: student.id } });
      expect(finalLinks.filter((l) => l.isPrimary)).toHaveLength(1);
    });

    it("404s across tenants", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "A", lastName: "B", phone: "+2348010000025", relationship: "MOTHER" },
      ]);
      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const guardianId = links.body[0].guardianId;

      const response = await request(app.getHttpServer())
        .put(`/api/v1/students/${student.id}/guardians/${guardianId}/primary`)
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(404);
    });

    it("403s for TEACHER", async () => {
      const student = await createStudent(sunriseAdminToken, [
        { firstName: "A", lastName: "B", phone: "+2348010000026", relationship: "MOTHER" },
        { firstName: "C", lastName: "D", phone: "+2348010000027", relationship: "FATHER" },
      ]);
      const links = await request(app.getHttpServer())
        .get(`/api/v1/students/${student.id}/guardians`)
        .set(auth(sunriseAdminToken));
      const nonPrimaryGuardianId = links.body.find((g: { isPrimary: boolean }) => !g.isPrimary).guardianId;

      const response = await request(app.getHttpServer())
        .put(`/api/v1/students/${student.id}/guardians/${nonPrimaryGuardianId}/primary`)
        .set(auth(sunriseTeacherToken));
      expect(response.status).toBe(403);
    });
  });
});
