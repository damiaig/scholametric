import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Classes (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let sunriseSchoolId: string;
  let jss1LevelId: string;
  let jss1AArmId: string;
  const createdClassArmIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseSchoolId = sunrise.id;
    const jss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunrise.id, name: "JSS 1" } });
    jss1LevelId = jss1.id;
    jss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { classLevelId: jss1.id, name: "A" } })).id;
  }, 20000);

  afterAll(async () => {
    if (!prisma) {
      await app?.close();
      return;
    }
    const ids = createdClassArmIds.filter((id): id is string => Boolean(id));
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.classArm.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe("GET /classes", () => {
    it("returns levels with arms, correct enrollment counts, and class teachers, matching direct DB counts", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/classes").set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);

      const session = await prisma.academicSession.findFirstOrThrow({
        where: { schoolId: sunriseSchoolId, isCurrent: true },
      });

      const jss1 = response.body.find((level: { id: string }) => level.id === jss1LevelId);
      expect(jss1).toBeDefined();
      const armA = jss1.arms.find((arm: { id: string }) => arm.id === jss1AArmId);
      expect(armA).toBeDefined();

      const expectedCount = await prisma.studentEnrollment.count({
        where: { classArmId: jss1AArmId, sessionId: session.id },
      });
      expect(armA.enrollmentCount).toBe(expectedCount);

      const expectedTeacher = await prisma.classTeacherAssignment.findFirst({
        where: { classArmId: jss1AArmId, sessionId: session.id },
        include: { teacherUser: true },
      });
      expect(armA.classTeacher.userId).toBe(expectedTeacher!.teacherUserId);
      expect(armA.classTeacher.firstName).toBe(expectedTeacher!.teacherUser.firstName);
    });

    it("runs as a CONSTANT number of queries regardless of data size (not N+1)", async () => {
      const queries: string[] = [];
      const listener = (event: { query: string }) => queries.push(event.query);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$on("query", listener);

      await request(app.getHttpServer()).get("/api/v1/classes").set(auth(sunriseAdminToken));
      const countForSunrise = queries.length; // Sunrise: 6 levels x 2 arms = 12 arms, ~125 students

      queries.length = 0;
      const hillcrest = await request(app.getHttpServer()).get("/api/v1/classes").set(auth(hillcrestAdminToken));
      expect(hillcrest.status).toBe(200);
      const countForHillcrest = queries.length; // Hillcrest: same 12 arms, 5 students — much less data

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$off?.("query", listener);

      expect(countForSunrise).toBeGreaterThan(0);
      expect(countForSunrise).toBeLessThanOrEqual(3); // one raw query + Nest/Prisma bookkeeping, never one-per-arm
      expect(countForSunrise).toBe(countForHillcrest); // identical shape regardless of how much data each school has
    });

    it("a second school's admin never sees the first school's classes", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/classes").set(auth(hillcrestAdminToken));
      expect(response.status).toBe(200);
      const allArmIds = response.body.flatMap((level: { arms: { id: string }[] }) => level.arms.map((a) => a.id));
      expect(allArmIds).not.toContain(jss1AArmId);
    });
  });

  describe("GET /class-arms/:id", () => {
    it("returns level, class teacher, subject teachers, and paginated current-session students", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/class-arms/${jss1AArmId}`)
        .query({ pageSize: 3 })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.classLevel.name).toBe("JSS 1");
      expect(response.body.classTeacher).not.toBeNull();
      expect(Array.isArray(response.body.subjectTeachers)).toBe(true);
      expect(response.body.students.items.length).toBeLessThanOrEqual(3);
      expect(response.body.students.total).toBeGreaterThan(0);
    });

    it("TEACHER can read (view row in the RBAC matrix)", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/class-arms/${jss1AArmId}`)
        .set(auth(sunriseTeacherToken));
      expect(response.status).toBe(200);
    });

    it("a cross-tenant arm id returns 404", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/class-arms/${jss1AArmId}`)
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(404);
    });
  });

  describe("POST /class-levels/:id/arms", () => {
    it("adds an arm to the level, wrapping the existing class-arms create", async () => {
      const armName = `Z${randomUUID().slice(0, 4)}`;
      const response = await request(app.getHttpServer())
        .post(`/api/v1/class-levels/${jss1LevelId}/arms`)
        .set(auth(sunriseAdminToken))
        .send({ name: armName });
      expect(response.status).toBe(201);
      expect(response.body.name).toBe(armName);
      expect(response.body.classLevelId).toBe(jss1LevelId);
      createdClassArmIds.push(response.body.id);

      const classes = await request(app.getHttpServer()).get("/api/v1/classes").set(auth(sunriseAdminToken));
      const jss1 = classes.body.find((level: { id: string }) => level.id === jss1LevelId);
      expect(jss1.arms.some((arm: { name: string }) => arm.name === armName)).toBe(true);
    });

    it("TEACHER cannot add an arm", async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/class-levels/${jss1LevelId}/arms`)
        .set(auth(sunriseTeacherToken))
        .send({ name: "Should fail" });
      expect(response.status).toBe(403);
    });
  });
});
