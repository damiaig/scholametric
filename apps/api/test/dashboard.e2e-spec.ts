import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Dashboard (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns correct counts scoped to the caller's school and current session", async () => {
    const schoolId = (await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } })).id;
    const currentSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId, isCurrent: true } });
    const currentTerm = await prisma.term.findFirst({
      where: { schoolId, sessionId: currentSession.id, isCurrent: true },
    });
    // totalActiveStudents is scoped to the CURRENT SESSION's enrollments,
    // not a school-wide count — otherwise it'd never reach 0 right after
    // activating a freshly-created session, defeating the empty-session
    // banner this stat drives on the frontend (SPEC_V0.2.md §4).
    const expectedActive = await prisma.student.count({
      where: { schoolId, status: "ACTIVE", enrollments: { some: { sessionId: currentSession.id } } },
    });

    const response = await request(app.getHttpServer())
      .get("/api/v1/dashboard/stats")
      .set("Authorization", `Bearer ${sunriseAdminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.totalActiveStudents).toBe(expectedActive);
    expect(response.body.currentSession).toBe(currentSession.name);
    expect(response.body.currentTerm).toBe(currentTerm?.name ?? null);
    expect(Array.isArray(response.body.studentsByLevel)).toBe(true);
    const sumOfLevels = response.body.studentsByLevel.reduce(
      (sum: number, level: { count: number }) => sum + level.count,
      0,
    );
    // Every currently-enrolled ACTIVE student in the current session should
    // show up in exactly one level bucket.
    expect(sumOfLevels).toBeLessThanOrEqual(expectedActive);
    expect(response.body.studentsByLevel.length).toBeGreaterThan(0);

    const ranks = response.body.studentsByLevel.map((level: { rank: number }) => level.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("totalActiveStudents drops to 0 right after activating a freshly-created, empty session", async () => {
    const schoolId = (await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } })).id;
    const originalCurrent = await prisma.academicSession.findFirstOrThrow({ where: { schoolId, isCurrent: true } });

    const emptySession = await prisma.academicSession.create({
      data: {
        schoolId,
        name: `Empty-Session-Regression-${Date.now()}`,
        startsOn: new Date("2030-09-01"),
        endsOn: new Date("2031-07-31"),
        isCurrent: false,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${emptySession.id}/activate`)
      .set("Authorization", `Bearer ${sunriseAdminToken}`)
      .send({ confirmName: emptySession.name })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get("/api/v1/dashboard/stats")
      .set("Authorization", `Bearer ${sunriseAdminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.currentSession).toBe(emptySession.name);
    expect(response.body.totalActiveStudents).toBe(0);
    expect(response.body.studentsByLevel).toEqual([]);

    // Restore the original current session so later tests/manual use aren't
    // left on an empty session.
    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${originalCurrent.id}/activate`)
      .set("Authorization", `Bearer ${sunriseAdminToken}`)
      .send({ confirmName: originalCurrent.name })
      .expect(200);

    // No DELETE /sessions/:id exists (sessions are permanent records for
    // real usage — see docs/API.md), so this direct-Prisma cleanup is
    // test-only: without it, every CI run left one more orphaned session
    // behind in Settings > Academic forever.
    await prisma.academicSession.delete({ where: { id: emptySession.id } });
  });

  it("TEACHER can also read dashboard stats", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/dashboard/stats")
      .set("Authorization", `Bearer ${sunriseTeacherToken}`);
    expect(response.status).toBe(200);
  });

  it("a second school's stats reflect only its own students", async () => {
    const hillcrestId = (await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } })).id;
    const hillcrestCurrentSession = await prisma.academicSession.findFirstOrThrow({
      where: { schoolId: hillcrestId, isCurrent: true },
    });
    const expectedHillcrestActive = await prisma.student.count({
      where: {
        schoolId: hillcrestId,
        status: "ACTIVE",
        enrollments: { some: { sessionId: hillcrestCurrentSession.id } },
      },
    });

    const hillcrestResponse = await request(app.getHttpServer())
      .get("/api/v1/dashboard/stats")
      .set("Authorization", `Bearer ${hillcrestAdminToken}`);

    expect(hillcrestResponse.status).toBe(200);
    expect(hillcrestResponse.body.totalActiveStudents).toBe(expectedHillcrestActive);
    expect(hillcrestResponse.body.currentSession).not.toBeNull();
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/dashboard/stats");
    expect(response.status).toBe(401);
  });
});
