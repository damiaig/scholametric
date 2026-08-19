import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// SPEC_V0.5.1.md §2.4, v0.5.1 step 2: a TEACHER's Classes list and class-arm
// detail are scoped to classes they're the class-teacher of OR hold a
// subject assignment in — admin/proprietor see everything, unchanged.
//
// A dedicated, freshly-created teacher (not any of the seeded ones) backs
// every test here: every seeded Sunrise teacher already gets cycled into a
// class-teacher assignment across ALL real arms by prisma/seed.ts's
// seedClassTeacherAssignments (round-robins every teacher over every arm),
// so none of them are safe "this teacher sees nothing" fixtures against the
// real data — a fresh teacher with zero assignments anywhere is the only
// way to assert an EXACT, uncontaminated set.
describe("Teacher visibility scoping (e2e) — SPEC_V0.5.1.md §2.4, v0.5.1 step 2", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let hillcrestAdminToken: string;
  let scratchTeacherToken: string;
  let scratchTeacherId: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let jss2LevelId: string;

  let classTeacherArmId: string; // scratchTeacher is the class-teacher here
  let subjectTeacherArmId: string; // scratchTeacher holds a subject assignment here only
  let unrelatedArmId: string; // scratchTeacher has zero relationship here
  let scratchSubjectId: string;

  const createdArmIds: string[] = [];
  const createdSubjectIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const sunriseSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = sunriseSession.id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2LevelId = jss2.id;

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4); // low cost — test-only
    const scratchTeacher = await prisma.user.create({
      data: {
        schoolId: sunriseId,
        email: "e2e.scratch.teacher@sunrise.test",
        passwordHash,
        firstName: "E2E",
        lastName: "ScratchTeacher",
        role: UserRole.TEACHER,
      },
    });
    scratchTeacherId = scratchTeacher.id;
    scratchTeacherToken = await loginAs(app, "e2e.scratch.teacher@sunrise.test", "sunrise");

    classTeacherArmId = (await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-TV-CT-${Date.now()}` } })).id;
    createdArmIds.push(classTeacherArmId);
    subjectTeacherArmId = (await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-TV-ST-${Date.now()}` } })).id;
    createdArmIds.push(subjectTeacherArmId);
    unrelatedArmId = (await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-TV-UN-${Date.now()}` } })).id;
    createdArmIds.push(unrelatedArmId);

    const scratchSubject = await prisma.subject.create({ data: { schoolId: sunriseId, name: `E2E TV Subject ${Date.now()}`, code: `E2ETV${Date.now()}`.slice(0, 10).toUpperCase() } });
    scratchSubjectId = scratchSubject.id;
    createdSubjectIds.push(scratchSubjectId);
  });

  afterAll(async () => {
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    await prisma.classTeacherAssignment.deleteMany({ where: { classArmId: { in: createdArmIds } } });
    await prisma.classArm.deleteMany({ where: { id: { in: createdArmIds } } });
    // refresh_tokens FKs to users (loginAs created one for the scratch teacher).
    await prisma.refreshToken.deleteMany({ where: { userId: scratchTeacherId } });
    await prisma.user.delete({ where: { id: scratchTeacherId } });
    await app.close();
  });

  it("a teacher with zero assignments anywhere gets an empty Classes list", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/classes").set(auth(scratchTeacherToken));
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("once assigned, GET /classes returns exactly the class-teacher arm and the subject-teacher arm, never the unrelated arm", async () => {
    await prisma.classTeacherAssignment.create({
      data: { schoolId: sunriseId, classArmId: classTeacherArmId, sessionId: sunriseSessionId, teacherUserId: scratchTeacherId },
    });
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: scratchSubjectId, classArmId: subjectTeacherArmId, sessionId: sunriseSessionId, teacherUserId: scratchTeacherId },
    });

    const response = await request(app.getHttpServer()).get("/api/v1/classes").set(auth(scratchTeacherToken));
    expect(response.status).toBe(200);

    const visibleArmIds = (response.body as { arms: { id: string }[] }[]).flatMap((level) => level.arms.map((arm) => arm.id));
    expect(visibleArmIds).toContain(classTeacherArmId);
    expect(visibleArmIds).toContain(subjectTeacherArmId);
    expect(visibleArmIds).not.toContain(unrelatedArmId);

    // Every level shown has at least one visible arm — no empty-arms
    // levels leak through for a scoped teacher view.
    for (const level of response.body as { arms: unknown[] }[]) {
      expect(level.arms.length).toBeGreaterThan(0);
    }
  });

  it("GET /class-arms/:id succeeds with the full roster for both the class-teacher arm and the subject-teacher arm", async () => {
    const classTeacherDetail = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${classTeacherArmId}`)
      .set(auth(scratchTeacherToken));
    expect(classTeacherDetail.status).toBe(200);
    expect(classTeacherDetail.body.classTeacher?.userId).toBe(scratchTeacherId);

    const subjectTeacherDetail = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${subjectTeacherArmId}`)
      .set(auth(scratchTeacherToken));
    expect(subjectTeacherDetail.status).toBe(200);
    expect(subjectTeacherDetail.body.subjectTeachers.some((s: { teacherUserId: string }) => s.teacherUserId === scratchTeacherId)).toBe(true);
  });

  it("GET /class-arms/:id 403s for an arm the teacher has no relationship to, with the exact existing message", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${unrelatedArmId}`)
      .set(auth(scratchTeacherToken));
    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You are not assigned to this class.");
  });

  it("SCHOOL_ADMIN/PROPRIETOR are unaffected — GET /classes and GET /class-arms/:id see everything, including the unrelated arm", async () => {
    const classesResponse = await request(app.getHttpServer()).get("/api/v1/classes").set(auth(sunriseAdminToken));
    expect(classesResponse.status).toBe(200);
    const visibleArmIds = (classesResponse.body as { arms: { id: string }[] }[]).flatMap((level) => level.arms.map((arm) => arm.id));
    expect(visibleArmIds).toContain(classTeacherArmId);
    expect(visibleArmIds).toContain(subjectTeacherArmId);
    expect(visibleArmIds).toContain(unrelatedArmId);

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${unrelatedArmId}`)
      .set(auth(sunriseAdminToken));
    expect(detailResponse.status).toBe(200);
  });

  it("404s (not 403) cross-tenant, both directions", async () => {
    const classArmDetail = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${classTeacherArmId}`)
      .set(auth(hillcrestAdminToken));
    expect(classArmDetail.status).toBe(404);

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrest.id, name: "JSS 1" } });
    const hillcrestArm = await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrest.id, classLevelId: hillcrestJss1.id, name: "A" } });
    const crossTenantAsSunriseAdmin = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${hillcrestArm.id}`)
      .set(auth(sunriseAdminToken));
    expect(crossTenantAsSunriseAdmin.status).toBe(404);
  });
});
