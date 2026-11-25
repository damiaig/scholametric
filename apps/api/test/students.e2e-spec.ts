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
  let coverTeacherToken: string;
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
    // teacher3@sunrise.test (Physics) has NO SubjectTeacherAssignment or
    // ClassTeacherAssignment anywhere in the seed — the same "assigned to
    // nothing" fixture lesson.e2e-spec.ts/homework.e2e-spec.ts already use
    // as their own out-of-scope teacher, reused here rather than inventing
    // a second one.
    coverTeacherToken = await loginAs(app, "teacher3@sunrise.test", "sunrise");
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

  const validStudentPayload = (overrides: Record<string, unknown> = {}) => {
    const suffix = randomUUID().slice(0, 8);
    return {
      firstName: "Test",
      lastName: `Student-${suffix}`,
      gender: "MALE",
      dateOfBirth: "2012-05-01",
      guardians: [{ firstName: "Test", lastName: "Guardian", phone: "+2348012345678", relationship: "FATHER" }],
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

      // Frozen legacy columns (guardian_name/guardian_phone are NOT NULL,
      // no migration this step) are derived from the resolved primary
      // guardian so the pre-v0.2 frontend still shows real data.
      const stored = await prisma.student.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(stored.guardianName).toBe("Test Guardian");
      expect(stored.guardianPhone).toBe("+2348012345678");

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/students/${response.body.id}`)
        .set(auth(sunriseAdminToken));
      expect(detail.body.guardians).toHaveLength(1);
      expect(detail.body.guardians[0]).toEqual(
        expect.objectContaining({ firstName: "Test", lastName: "Guardian", isPrimary: true }),
      );

      const auditRow = await prisma.auditLog.findFirst({
        where: { entityId: response.body.id, action: "student.create" },
      });
      expect(auditRow).not.toBeNull();
      expect(auditRow!.schoolId).toBe(sunriseSchoolId);
    });

    it("creates a student with two guardians, exactly one primary, and rejects two explicit primaries", async () => {
      const twoGuardians = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(
          validStudentPayload({
            guardians: [
              { firstName: "Primary", lastName: "Parent", phone: "+2348011111111", relationship: "MOTHER" },
              { firstName: "Secondary", lastName: "Parent", phone: "+2348022222222", relationship: "FATHER" },
            ],
          }),
        );
      expect(twoGuardians.status).toBe(201);
      createdStudentIds.push(twoGuardians.body.id);

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/students/${twoGuardians.body.id}`)
        .set(auth(sunriseAdminToken));
      expect(detail.body.guardians).toHaveLength(2);
      expect(detail.body.guardians.filter((g: { isPrimary: boolean }) => g.isPrimary)).toHaveLength(1);
      expect(detail.body.guardians[0].isPrimary).toBe(true);
      expect(detail.body.guardians[0].firstName).toBe("Primary");

      const twoPrimaries = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(
          validStudentPayload({
            guardians: [
              { firstName: "A", lastName: "A", phone: "+2348033333333", relationship: "MOTHER", isPrimary: true },
              { firstName: "B", lastName: "B", phone: "+2348044444444", relationship: "FATHER", isPrimary: true },
            ],
          }),
        );
      expect(twoPrimaries.status).toBe(400);
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
    // v0.9 Item E1 (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) —
    // sunriseTeacherToken (teacher@sunrise.test) teaches sunriseClassArmId
    // (JSS 1 A, Mathematics) — the SAME class sunriseSeededStudentId is
    // enrolled in — so this is deliberately the IN-CLASS case, not a
    // generic "any TEACHER" one; see the sibling test below for the
    // out-of-class refusal.
    it("in-class TEACHER: every GET succeeds, every mutation 403s", async () => {
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
        .send({ firstName: "should be rejected" });
      expect(patch.status).toBe(403);

      const getGuardians = await request(app.getHttpServer())
        .get(`/api/v1/students/${sunriseSeededStudentId}/guardians`)
        .set(auth(sunriseTeacherToken));
      expect(getGuardians.status).toBe(200);

      const addGuardian = await request(app.getHttpServer())
        .post(`/api/v1/students/${sunriseSeededStudentId}/guardians`)
        .set(auth(sunriseTeacherToken))
        .send({ firstName: "Should", lastName: "Reject", phone: "+2348000000000", relationship: "OTHER" });
      expect(addGuardian.status).toBe(403);

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

    // v0.9 Item E1 — coverTeacherToken (teacher3@sunrise.test) teaches
    // nothing at all, so the student's CURRENT class arm is never one of
    // theirs: every read route refuses them, and the refusal body carries
    // no student field at all (not even a redacted one).
    it("out-of-class TEACHER: list excludes the student, detail/guardians 403 with no student fields in the body", async () => {
      const list = await request(app.getHttpServer())
        .get("/api/v1/students")
        .query({ search: "SUN/2026/0001", pageSize: 100 })
        .set(auth(coverTeacherToken));
      expect(list.status).toBe(200);
      expect(list.body.items.some((s: { id: string }) => s.id === sunriseSeededStudentId)).toBe(false);

      const getOne = await request(app.getHttpServer())
        .get(`/api/v1/students/${sunriseSeededStudentId}`)
        .set(auth(coverTeacherToken));
      expect(getOne.status).toBe(403);
      expect(getOne.body).not.toHaveProperty("firstName");
      expect(getOne.body).not.toHaveProperty("lastName");
      expect(getOne.body).not.toHaveProperty("admissionNumber");
      expect(getOne.body).not.toHaveProperty("dateOfBirth");
      // The standard error envelope's own `path` legitimately echoes the
      // requested URL (CLAUDE.md §5) — the caller already knows the ID
      // they asked for. What must never appear is anything the caller
      // DIDN'T already have: the student's name/DOB/admission number.
      expect(Object.keys(getOne.body).sort()).toEqual(["error", "message", "path", "statusCode", "timestamp"]);

      const getGuardians = await request(app.getHttpServer())
        .get(`/api/v1/students/${sunriseSeededStudentId}/guardians`)
        .set(auth(coverTeacherToken));
      expect(getGuardians.status).toBe(403);
      expect(Array.isArray(getGuardians.body)).toBe(false);
    });

    // v0.9 Item E1 — the SAME `where` drives both findMany and count (see
    // students.service.ts#findAll's own comment): a name search for a
    // student outside the caller's scope can't surface them, and `total`
    // is always the FILTERED count, never the unfiltered one a leaked
    // pagination total would reveal.
    it("out-of-class TEACHER: a name search for the out-of-scope student returns zero results, total included", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/students")
        .query({ search: "Oluwa", pageSize: 100 })
        .set(auth(coverTeacherToken));
      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    // v0.9 Item E1 — a student with no row in the CURRENT session's
    // enrollment table (e.g. never re-enrolled after a rollover) has
    // nothing for the teacher rule to check against: admin/proprietor
    // still sees them (unchanged), a TEACHER (even the one who taught
    // their LAST known class) gets no list row and a categorical 403.
    it("a student with no current-session enrollment is visible to admin only; any TEACHER is refused", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(validStudentPayload());
      expect(created.status).toBe(201);
      createdStudentIds.push(created.body.id);

      await prisma.studentEnrollment.deleteMany({ where: { studentId: created.body.id } });

      const adminGet = await request(app.getHttpServer())
        .get(`/api/v1/students/${created.body.id}`)
        .set(auth(sunriseAdminToken));
      expect(adminGet.status).toBe(200);
      expect(adminGet.body.currentEnrollment).toBeNull();

      const teacherGet = await request(app.getHttpServer())
        .get(`/api/v1/students/${created.body.id}`)
        .set(auth(sunriseTeacherToken));
      expect(teacherGet.status).toBe(403);

      const teacherList = await request(app.getHttpServer())
        .get("/api/v1/students")
        .query({ search: created.body.lastName, pageSize: 100 })
        .set(auth(sunriseTeacherToken));
      expect(teacherList.body.items.some((s: { id: string }) => s.id === created.body.id)).toBe(false);
    });

    // v0.9 Item E1 — the between-session rollover edge case: with no
    // academic session marked current at all, a TEACHER has no possible
    // current-session assignment to check against, so the list is simply
    // empty — a real, recorded behaviour change at rollover (see
    // docs/DECISIONS.md), not an error.
    it("a TEACHER sees an empty list (not an error) when no academic session is current", async () => {
      const currentSession = await prisma.academicSession.findFirstOrThrow({
        where: { schoolId: sunriseSchoolId, isCurrent: true },
      });
      await prisma.academicSession.update({ where: { id: currentSession.id }, data: { isCurrent: false } });
      try {
        const response = await request(app.getHttpServer()).get("/api/v1/students").set(auth(sunriseTeacherToken));
        expect(response.status).toBe(200);
        expect(response.body.items).toEqual([]);
        expect(response.body.total).toBe(0);
      } finally {
        await prisma.academicSession.update({ where: { id: currentSession.id }, data: { isCurrent: true } });
      }
    });

    it("a TEACHER reaching for a cross-tenant student 404s, same as admin — never 403", async () => {
      const hillcrestStudent = await prisma.student.findFirstOrThrow({ where: { NOT: { schoolId: sunriseSchoolId } } });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${hillcrestStudent.id}`)
        .set(auth(sunriseTeacherToken));
      expect(response.status).toBe(404);
    });
  });

  describe("GET /students/:id — backfilled (pre-v0.2) students", () => {
    it("reads guardian data through the new endpoint for a student created before the guardians tables existed", async () => {
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/students/${sunriseSeededStudentId}`)
        .set(auth(sunriseAdminToken));
      expect(detail.status).toBe(200);
      expect(Array.isArray(detail.body.guardians)).toBe(true);
      expect(detail.body.guardians.length).toBeGreaterThanOrEqual(1);
      expect(detail.body.guardians.filter((g: { isPrimary: boolean }) => g.isPrimary)).toHaveLength(1);
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
        .send({ firstName: "hijacked" });
      expect(patch.status).toBe(404);

      const getGuardians = await request(app.getHttpServer())
        .get(`/api/v1/students/${sunriseSeededStudentId}/guardians`)
        .set(auth(hillcrestAdminToken));
      expect(getGuardians.status).toBe(404);

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
    it("updates bio fields and records an audit row (guardian fields moved to /guardians endpoints in v0.2)", async () => {
      const create = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(validStudentPayload());
      const studentId = create.body.id;
      createdStudentIds.push(studentId);

      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/students/${studentId}`)
        .set(auth(sunriseAdminToken))
        .send({ firstName: "Updated" });
      expect(patch.status).toBe(200);
      expect(patch.body.firstName).toBe("Updated");

      const auditRow = await prisma.auditLog.findFirst({ where: { entityId: studentId, action: "student.update" } });
      expect(auditRow).not.toBeNull();
      expect(auditRow!.actorUserId).not.toBeNull();
      expect(auditRow!.schoolId).toBe(sunriseSchoolId);
    });

    it("rejects guardian fields as unknown properties (they no longer live on this DTO)", async () => {
      const create = await request(app.getHttpServer())
        .post("/api/v1/students")
        .set(auth(sunriseAdminToken))
        .send(validStudentPayload());
      createdStudentIds.push(create.body.id);

      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/students/${create.body.id}`)
        .set(auth(sunriseAdminToken))
        .send({ guardianPhone: "+2348099999999" });
      expect(patch.status).toBe(400);
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
