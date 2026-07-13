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

  it("returns correct counts scoped to the caller's school", async () => {
    const schoolId = (await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } })).id;
    const expectedActive = await prisma.student.count({ where: { schoolId, status: "ACTIVE" } });
    const currentSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId, isCurrent: true } });
    const currentTerm = await prisma.term.findFirst({
      where: { schoolId, sessionId: currentSession.id, isCurrent: true },
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

  it("TEACHER can also read dashboard stats", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/dashboard/stats")
      .set("Authorization", `Bearer ${sunriseTeacherToken}`);
    expect(response.status).toBe(200);
  });

  it("a second school's stats reflect only its own students", async () => {
    const hillcrestId = (await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } })).id;
    const expectedHillcrestActive = await prisma.student.count({ where: { schoolId: hillcrestId, status: "ACTIVE" } });

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
