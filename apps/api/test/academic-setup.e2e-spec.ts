import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Academic setup (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdminToken: string;
  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let sunriseSchoolId: string;
  let sunriseSessionId: string;
  let sunriseClassArmId: string;
  const createdSessionIds: string[] = [];
  const createdClassLevelIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    superAdminToken = await loginAs(app, "super@scholametric.test", "platform");
    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseSchoolId = sunrise.id;
    const sunriseSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseSchoolId } });
    sunriseSessionId = sunriseSession.id;
    const sunriseClassArm = await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseSchoolId } });
    sunriseClassArmId = sunriseClassArm.id;
  });

  afterAll(async () => {
    const sessionIds = createdSessionIds.filter((id): id is string => Boolean(id));
    const classLevelIds = createdClassLevelIds.filter((id): id is string => Boolean(id));
    await prisma.term.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.academicSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.classArm.deleteMany({ where: { classLevelId: { in: classLevelIds } } });
    await prisma.classLevel.deleteMany({ where: { id: { in: classLevelIds } } });
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe("RBAC", () => {
    it("403s SUPER_ADMIN and TEACHER on school-setup endpoints", async () => {
      for (const token of [superAdminToken, sunriseTeacherToken]) {
        const listSessions = await request(app.getHttpServer()).get("/api/v1/sessions").set(auth(token));
        expect(listSessions.status).toBe(403);

        const createLevel = await request(app.getHttpServer())
          .post("/api/v1/class-levels")
          .set(auth(token))
          .send({ name: `x-${randomUUID()}`, rank: 1 });
        expect(createLevel.status).toBe(403);
      }
    });
  });

  it("401s an unauthenticated request", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/sessions");
    expect(response.status).toBe(401);
  });

  describe("cross-tenant isolation", () => {
    it("hillcrest's admin sees only hillcrest sessions and class-arms", async () => {
      const sessions = await request(app.getHttpServer())
        .get("/api/v1/sessions?pageSize=100")
        .set(auth(hillcrestAdminToken));
      expect(sessions.status).toBe(200);
      expect(sessions.body.items.map((s: { id: string }) => s.id)).not.toContain(sunriseSessionId);

      const arms = await request(app.getHttpServer())
        .get("/api/v1/class-arms?pageSize=100")
        .set(auth(hillcrestAdminToken));
      expect(arms.status).toBe(200);
      expect(arms.body.items.map((a: { id: string }) => a.id)).not.toContain(sunriseClassArmId);
    });

    it("404s (not 403) when hillcrest's admin fetches sunrise's resources by real ID", async () => {
      const patchSession = await request(app.getHttpServer())
        .patch(`/api/v1/sessions/${sunriseSessionId}`)
        .set(auth(hillcrestAdminToken))
        .send({ name: "hijacked" });
      expect(patchSession.status).toBe(404);

      const patchArm = await request(app.getHttpServer())
        .patch(`/api/v1/class-arms/${sunriseClassArmId}`)
        .set(auth(hillcrestAdminToken))
        .send({ name: "hijacked" });
      expect(patchArm.status).toBe(404);
    });
  });

  describe("session activation", () => {
    it("activating session B atomically deactivates session A", async () => {
      const suffix = randomUUID().slice(0, 8);
      const create = await request(app.getHttpServer())
        .post("/api/v1/sessions")
        .set(auth(sunriseAdminToken))
        .send({ name: `Session B ${suffix}`, startsOn: "2027-09-01", endsOn: "2028-07-31" });
      expect(create.status).toBe(201);
      const sessionBId = create.body.id;
      createdSessionIds.push(sessionBId);

      const activate = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${sessionBId}/activate`)
        .set(auth(sunriseAdminToken));
      expect(activate.status).toBe(200);
      expect(activate.body.isCurrent).toBe(true);

      const currentCount = await prisma.academicSession.count({
        where: { schoolId: sunriseSchoolId, isCurrent: true },
      });
      expect(currentCount).toBe(1);

      const originalSession = await prisma.academicSession.findUniqueOrThrow({ where: { id: sunriseSessionId } });
      expect(originalSession.isCurrent).toBe(false);
    });
  });

  describe("term activation", () => {
    it("activating term 2 atomically deactivates term 1 within the same session", async () => {
      const suffix = randomUUID().slice(0, 8);
      const sessionResponse = await request(app.getHttpServer())
        .post("/api/v1/sessions")
        .set(auth(sunriseAdminToken))
        .send({ name: `Term test session ${suffix}`, startsOn: "2027-09-01", endsOn: "2028-07-31" });
      const sessionId = sessionResponse.body.id;
      createdSessionIds.push(sessionId);

      const term1 = await request(app.getHttpServer())
        .post("/api/v1/terms")
        .set(auth(sunriseAdminToken))
        .send({ sessionId, name: "FIRST", startsOn: "2027-09-01", endsOn: "2027-12-12" });
      expect(term1.status).toBe(201);

      const activate1 = await request(app.getHttpServer())
        .post(`/api/v1/terms/${term1.body.id}/activate`)
        .set(auth(sunriseAdminToken));
      expect(activate1.status).toBe(200);

      const term2 = await request(app.getHttpServer())
        .post("/api/v1/terms")
        .set(auth(sunriseAdminToken))
        .send({ sessionId, name: "SECOND", startsOn: "2028-01-05", endsOn: "2028-04-02" });
      expect(term2.status).toBe(201);

      const activate2 = await request(app.getHttpServer())
        .post(`/api/v1/terms/${term2.body.id}/activate`)
        .set(auth(sunriseAdminToken));
      expect(activate2.status).toBe(200);
      expect(activate2.body.isCurrent).toBe(true);

      const refreshedTerm1 = await prisma.term.findUniqueOrThrow({ where: { id: term1.body.id } });
      expect(refreshedTerm1.isCurrent).toBe(false);

      const currentCount = await prisma.term.count({ where: { sessionId, isCurrent: true } });
      expect(currentCount).toBe(1);
    });
  });

  describe("duplicate class-level names", () => {
    it("409s a duplicate name in the same school but succeeds in a different school", async () => {
      const name = `Reception ${randomUUID().slice(0, 8)}`;

      const first = await request(app.getHttpServer())
        .post("/api/v1/class-levels")
        .set(auth(sunriseAdminToken))
        .send({ name, rank: 0 });
      expect(first.status).toBe(201);
      createdClassLevelIds.push(first.body.id);

      const duplicate = await request(app.getHttpServer())
        .post("/api/v1/class-levels")
        .set(auth(sunriseAdminToken))
        .send({ name, rank: 0 });
      expect(duplicate.status).toBe(409);

      const otherSchool = await request(app.getHttpServer())
        .post("/api/v1/class-levels")
        .set(auth(hillcrestAdminToken))
        .send({ name, rank: 0 });
      expect(otherSchool.status).toBe(201);
      createdClassLevelIds.push(otherSchool.body.id);
    });
  });
});
