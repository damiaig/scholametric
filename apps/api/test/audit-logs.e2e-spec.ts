import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Audit logs (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let sunriseClassArmId: string;
  const createdStudentIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseClassArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunrise.id } })).id;
  }, 20000);

  afterAll(async () => {
    if (!prisma) {
      await app?.close();
      return;
    }
    const ids = createdStudentIds.filter((id): id is string => Boolean(id));
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.student.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe("GET /audit-logs", () => {
    it("returns entries newest first, paginated, tenant-scoped", async () => {
      // Generate a fresh, attributable entry via a real mutation.
      const created = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send({
          firstName: "Audit",
          lastName: `Test-${randomUUID().slice(0, 8)}`,
          gender: "MALE",
          dateOfBirth: "2012-05-01",
          guardianName: "Test Guardian",
          guardianPhone: "+2348012345678",
          classArmId: sunriseClassArmId,
        });
      expect(created.status).toBe(201);
      createdStudentIds.push(created.body.id);

      const response = await request(app.getHttpServer())
        .get("/api/v1/audit-logs")
        .query({ pageSize: 5 })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.items[0].entityId).toBe(created.body.id);
      expect(response.body.items[0].action).toBe("student.create");
      expect(response.body.items[0].actor.firstName).toBe("Adaobi");

      const timestamps = response.body.items.map((i: { createdAt: string }) => new Date(i.createdAt).getTime());
      expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
    });

    it("filters by entityType and entityId, and returns the withdraw reason in metadata", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send({
          firstName: "Audit",
          lastName: `Withdraw-${randomUUID().slice(0, 8)}`,
          gender: "FEMALE",
          dateOfBirth: "2012-05-01",
          guardianName: "Test Guardian",
          guardianPhone: "+2348012345678",
          classArmId: sunriseClassArmId,
        });
      createdStudentIds.push(created.body.id);

      const reason = `relocated ${randomUUID().slice(0, 8)}`;
      const withdraw = await request(app.getHttpServer())
        .post(`/api/v1/students/${created.body.id}/withdraw`)
        .set(auth(sunriseAdminToken))
        .send({ reason });
      expect(withdraw.status).toBe(200);

      const response = await request(app.getHttpServer())
        .get("/api/v1/audit-logs")
        .query({ entityType: "student", entityId: created.body.id })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      const withdrawEntry = response.body.items.find((i: { action: string }) => i.action === "student.withdraw");
      expect(withdrawEntry).toBeDefined();
      expect(withdrawEntry.metadata.reason).toBe(reason);

      const createEntry = response.body.items.find((i: { action: string }) => i.action === "student.create");
      expect(createEntry).toBeDefined();
      expect(response.body.items.every((i: { entityId: string }) => i.entityId === created.body.id)).toBe(true);
    });

    it("a second school's admin never sees the first school's audit entries", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/audit-logs")
        .query({ pageSize: 100 })
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.items.some((i: { entityId: string }) => createdStudentIds.includes(i.entityId))).toBe(
        false,
      );
    });

    it("TEACHER cannot read audit logs", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/audit-logs").set(auth(sunriseTeacherToken));
      expect(response.status).toBe(403);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/audit-logs");
      expect(response.status).toBe(401);
    });
  });
});
