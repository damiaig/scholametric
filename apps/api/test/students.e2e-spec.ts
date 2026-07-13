import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Students (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let sunriseSchoolId: string;
  let sunriseClassArmId: string;
  let hillcrestClassArmId: string;
  let sunriseSeededStudentId: string;
  const createdStudentIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseSchoolId = sunrise.id;
    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });

    const sunriseArm = await prisma.classArm.findFirstOrThrow({
      where: { schoolId: sunriseSchoolId, name: "A", classLevel: { name: "JSS 1" } },
    });
    sunriseClassArmId = sunriseArm.id;
    const hillcrestArm = await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrest.id } });
    hillcrestClassArmId = hillcrestArm.id;

    const seededStudent = await prisma.student.findFirstOrThrow({
      where: { schoolId: sunriseSchoolId, admissionNumber: "SUN/2026/0001" },
    });
    sunriseSeededStudentId = seededStudent.id;
  });

  afterAll(async () => {
    const ids = createdStudentIds.filter((id): id is string => Boolean(id));
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.student.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const validStudentPayload = (overrides: Record<string, unknown> = {}) => {
    const suffix = randomUUID().slice(0, 8);
    return {
      firstName: "Test",
      lastName: `Student-${suffix}`,
      gender: "MALE",
      dateOfBirth: "2012-05-01",
      guardianName: "Test Guardian",
      guardianPhone: "+2348012345678",
      classArmId: sunriseClassArmId,
      ...overrides,
    };
  };

  describe("POST /students", () => {
    it("creates the student + enrollment in one call with a generated admission number, and an audit row", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(validStudentPayload());

      expect(response.status).toBe(201);
      expect(response.body.admissionNumber).toMatch(/^SUN\/2026\/\d{4}$/);
      createdStudentIds.push(response.body.id);

      const enrollment = await prisma.studentEnrollment.findFirst({ where: { studentId: response.body.id } });
      expect(enrollment).not.toBeNull();
      expect(enrollment!.classArmId).toBe(sunriseClassArmId);

      const auditRow = await prisma.auditLog.findFirst({
        where: { entityId: response.body.id, action: "student.create" },
      });
      expect(auditRow).not.toBeNull();
      expect(auditRow!.schoolId).toBe(sunriseSchoolId);
    });

    it("increments the admission number sequence on successive creates", async () => {
      const first = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(validStudentPayload());
      const second = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(validStudentPayload());
      createdStudentIds.push(first.body.id, second.body.id);

      const firstSeq = Number(first.body.admissionNumber.split("/")[2]);
      const secondSeq = Number(second.body.admissionNumber.split("/")[2]);
      expect(secondSeq).toBe(firstSeq + 1);
    });

    it("never mints the same admission number under concurrent creates", async () => {
      const [a, b] = await Promise.all([
        request(app.getHttpServer()).post("/api/v1/students").set(auth(sunriseAdminToken)).send(validStudentPayload()),
        request(app.getHttpServer()).post("/api/v1/students").set(auth(sunriseAdminToken)).send(validStudentPayload()),
      ]);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      createdStudentIds.push(a.body.id, b.body.id);
      expect(a.body.admissionNumber).not.toBe(b.body.admissionNumber);
    });

    it("accepts a custom admission number, 409s a duplicate within the school, and allows the same number at a different school", async () => {
      const customNumber = `SUN-CUSTOM-${randomUUID().slice(0, 8)}`;

      const first = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(validStudentPayload({ admissionNumber: customNumber }));
      expect(first.status).toBe(201);
      createdStudentIds.push(first.body.id);

      const duplicate = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(validStudentPayload({ admissionNumber: customNumber }));
      expect(duplicate.status).toBe(409);

      const atHillcrest = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(hillcrestAdminToken))
        .send(validStudentPayload({ admissionNumber: customNumber, classArmId: hillcrestClassArmId }));
      expect(atHillcrest.status).toBe(201);
      createdStudentIds.push(atHillcrest.body.id);
    });
  });

  describe("GET /students search", () => {
    it("matches a partial first name via the trigram index", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/students")
        .query({ search: "Oluwa", pageSize: 100 })
        .set(auth(sunriseAdminToken));

      expect(response.status).toBe(200);
      expect(response.body.items.some((s: { firstName: string }) => s.firstName.includes("Oluwa"))).toBe(true);
    });

    it("matches by admission number", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/students")
        .query({ search: "SUN/2026/0001" })
        .set(auth(sunriseAdminToken));

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].admissionNumber).toBe("SUN/2026/0001");
      // List rows carry the same currentEnrollment shape as GET /students/:id
      // (step 7 needs class/level per row, not just a bare Student).
      expect(response.body.items[0].currentEnrollment).toEqual(
        expect.objectContaining({
          classArm: expect.objectContaining({
            name: expect.any(String),
            classLevel: expect.objectContaining({ name: expect.any(String) }),
          }),
        }),
      );
    });

    it("filters by classArmId (the seeded ~100-student JSS 2 A class)", async () => {
      const jss2a = await prisma.classArm.findFirstOrThrow({
        where: { schoolId: sunriseSchoolId, name: "A", classLevel: { name: "JSS 2" } },
      });

      const response = await request(app.getHttpServer())
        .get("/api/v1/students")
        .query({ classArmId: jss2a.id, pageSize: 100 })
        .set(auth(sunriseAdminToken));

      expect(response.status).toBe(200);
      expect(response.body.total).toBeGreaterThanOrEqual(100);
    });

    it("paginates the ~125-student school deterministically", async () => {
      const page1 = await request(app.getHttpServer())
        .get("/api/v1/students")
        .query({ page: 1, pageSize: 20 })
        .set(auth(sunriseAdminToken));
      expect(page1.status).toBe(200);
      expect(page1.body.items).toHaveLength(20);
      expect(page1.body.total).toBeGreaterThanOrEqual(125);

      const page2 = await request(app.getHttpServer())
        .get("/api/v1/students")
        .query({ page: 2, pageSize: 20 })
        .set(auth(sunriseAdminToken));
      expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
    });
  });

  describe("RBAC", () => {
    it("TEACHER: every GET succeeds, every mutation 403s", async () => {
      const list = await request(app.getHttpServer()).get("/api/v1/students").set(auth(sunriseTeacherToken));
      expect(list.status).toBe(200);

      const getOne = await request(app.getHttpServer())
        .get(`/api/v1/students/${sunriseSeededStudentId}`)
        .set(auth(sunriseTeacherToken));
      expect(getOne.status).toBe(200);

      const create = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseTeacherToken))
        .send(validStudentPayload());
      expect(create.status).toBe(403);

      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/students/${sunriseSeededStudentId}`)
        .set(auth(sunriseTeacherToken))
        .send({ address: "should be rejected" });
      expect(patch.status).toBe(403);

      const withdraw = await request(app.getHttpServer())
        .post(`/api/v1/students/${sunriseSeededStudentId}/withdraw`)
        .set(auth(sunriseTeacherToken))
        .send({ reason: "should be rejected" });
      expect(withdraw.status).toBe(403);

      const transfer = await request(app.getHttpServer())
        .post(`/api/v1/students/${sunriseSeededStudentId}/transfer-class`)
        .set(auth(sunriseTeacherToken))
        .send({ classArmId: sunriseClassArmId });
      expect(transfer.status).toBe(403);
    });
  });

  describe("cross-tenant isolation", () => {
    it("404s (not 403) when hillcrest's admin reaches for a sunrise student by real ID", async () => {
      const get = await request(app.getHttpServer())
        .get(`/api/v1/students/${sunriseSeededStudentId}`)
        .set(auth(hillcrestAdminToken));
      expect(get.status).toBe(404);

      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/students/${sunriseSeededStudentId}`)
        .set(auth(hillcrestAdminToken))
        .send({ address: "hijacked" });
      expect(patch.status).toBe(404);

      const withdraw = await request(app.getHttpServer())
        .post(`/api/v1/students/${sunriseSeededStudentId}/withdraw`)
        .set(auth(hillcrestAdminToken))
        .send({ reason: "hijacked" });
      expect(withdraw.status).toBe(404);
    });

    it("hillcrest's list never contains a sunrise student", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/students")
        .query({ pageSize: 100 })
        .set(auth(hillcrestAdminToken));

      expect(response.status).toBe(200);
      expect(response.body.items.map((s: { id: string }) => s.id)).not.toContain(sunriseSeededStudentId);
    });
  });

  describe("PATCH /students/:id", () => {
    it("updates bio/guardian fields and records an audit row", async () => {
      const create = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(validStudentPayload());
      const studentId = create.body.id;
      createdStudentIds.push(studentId);

      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/students/${studentId}`)
        .set(auth(sunriseAdminToken))
        .send({ guardianPhone: "+2348099999999" });
      expect(patch.status).toBe(200);
      expect(patch.body.guardianPhone).toBe("+2348099999999");

      const auditRow = await prisma.auditLog.findFirst({ where: { entityId: studentId, action: "student.update" } });
      expect(auditRow).not.toBeNull();
      expect(auditRow!.actorUserId).not.toBeNull();
      expect(auditRow!.schoolId).toBe(sunriseSchoolId);
    });
  });

  describe("POST /students/:id/withdraw", () => {
    it("changes status, records the reason in audit metadata, and moves the student out of the default list", async () => {
      const create = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(validStudentPayload());
      const studentId = create.body.id;
      const lastName = create.body.lastName;
      createdStudentIds.push(studentId);

      const reason = `left school ${randomUUID().slice(0, 8)}`;
      const withdraw = await request(app.getHttpServer())
        .post(`/api/v1/students/${studentId}/withdraw`)
        .set(auth(sunriseAdminToken))
        .send({ reason });
      expect(withdraw.status).toBe(200);
      expect(withdraw.body.status).toBe("WITHDRAWN");

      const auditRow = await prisma.auditLog.findFirst({ where: { entityId: studentId, action: "student.withdraw" } });
      expect(auditRow).not.toBeNull();
      expect((auditRow!.metadata as { reason: string }).reason).toBe(reason);

      const defaultList = await request(app.getHttpServer())
        .get("/api/v1/students")
        .query({ search: lastName })
        .set(auth(sunriseAdminToken));
      expect(defaultList.body.items.map((s: { id: string }) => s.id)).not.toContain(studentId);

      const withdrawnList = await request(app.getHttpServer())
        .get("/api/v1/students")
        .query({ search: lastName, status: "WITHDRAWN" })
        .set(auth(sunriseAdminToken));
      expect(withdrawnList.body.items.map((s: { id: string }) => s.id)).toContain(studentId);
    });
  });

  describe("POST /students/:id/transfer-class", () => {
    it("transfers within the school, records an audit row, and rejects a hillcrest class arm ID", async () => {
      const create = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(validStudentPayload());
      const studentId = create.body.id;
      createdStudentIds.push(studentId);

      const jss3a = await prisma.classArm.findFirstOrThrow({
        where: { schoolId: sunriseSchoolId, name: "A", classLevel: { name: "JSS 3" } },
      });

      const transfer = await request(app.getHttpServer())
        .post(`/api/v1/students/${studentId}/transfer-class`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss3a.id });
      expect(transfer.status).toBe(200);

      const enrollment = await prisma.studentEnrollment.findFirst({ where: { studentId } });
      expect(enrollment!.classArmId).toBe(jss3a.id);

      const auditRow = await prisma.auditLog.findFirst({
        where: { entityId: studentId, action: "student.transferClass" },
      });
      expect(auditRow).not.toBeNull();

      const rejected = await request(app.getHttpServer())
        .post(`/api/v1/students/${studentId}/transfer-class`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: hillcrestClassArmId });
      expect(rejected.status).toBe(404);
    });
  });
});
