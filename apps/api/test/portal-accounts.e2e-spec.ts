import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { GuardianRelationship, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// SPEC_V0.6.md §5 step 1 — portal account provisioning + family coding.
// Grouping/stem/escalation pure functions have their own coverage
// implicitly exercised here through the service; this suite proves the
// end-to-end DB behavior: right accounts for right records, school-wide
// username uniqueness, family grouping by guardian links (not surname
// text), the blended-family read-scope warning, idempotency + growth
// stability, and the tenancy/role boundaries.
//
// The first test provisions the REAL seeded Sunrise roster (100+ students)
// — bcrypt cost 12 per account (CLAUDE.md §5), so this one call is
// genuinely slow; it gets an extended timeout. Every other test creates a
// small, self-contained fixture family (own guardians/students, own
// surnames) and re-provisions — those calls only pay bcrypt cost for the
// handful of NEW accounts each test adds, so they run at normal speed.
describe("Portal Accounts (e2e) — SPEC_V0.6.md §5 step 1", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let sunriseSchoolId: string;

  const createdStudentIds: string[] = [];
  const createdGuardianIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function makeStudent(admissionNumber: string, firstName: string, lastName: string) {
    const student = await prisma.student.create({
      data: {
        schoolId: sunriseSchoolId,
        admissionNumber,
        firstName,
        lastName,
        gender: "MALE",
        dateOfBirth: new Date("2014-03-01"),
        guardianName: `${lastName} Household`,
        guardianPhone: "+2348000000000",
      },
    });
    createdStudentIds.push(student.id);
    return student;
  }

  async function makeGuardian(firstName: string, lastName: string, phoneSuffix: string) {
    const guardian = await prisma.guardian.create({
      data: { schoolId: sunriseSchoolId, firstName, lastName, phone: `+234801${phoneSuffix}` },
    });
    createdGuardianIds.push(guardian.id);
    return guardian;
  }

  async function link(studentId: string, guardianId: string, isPrimary: boolean) {
    await prisma.studentGuardian.create({
      data: { schoolId: sunriseSchoolId, studentId, guardianId, relationship: GuardianRelationship.OTHER, isPrimary },
    });
  }

  function provision(token: string) {
    return request(app.getHttpServer()).post("/api/v1/portal-accounts/provision").set(auth(token));
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseSchoolId = sunrise.id;
  });

  afterAll(async () => {
    // Only tears down THIS suite's own scratch fixtures — the real
    // provisioned accounts for the seeded roster (created by the first
    // test below) are a legitimate side effect, same convention as every
    // other e2e spec that mutates real seed data (e.g.
    // mark-absent-after-publish.e2e-spec.ts) — the standard fresh-stack
    // reset (docker compose down -v + reseed) is what clears these, not
    // per-test cleanup.
    const portalUserIds = (
      await prisma.user.findMany({
        where: { OR: [{ studentId: { in: createdStudentIds } }, { guardianId: { in: createdGuardianIds } }] },
        select: { id: true },
      })
    ).map((u) => u.id);
    await prisma.refreshToken.deleteMany({ where: { userId: { in: portalUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: portalUserIds } } });
    await prisma.studentGuardian.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.guardian.deleteMany({ where: { id: { in: createdGuardianIds } } });
    await app.close();
  });

  describe("POST /portal-accounts/provision", () => {
    it(
      "provisions the real seeded roster: right accounts for right records, no username collisions school-wide",
      async () => {
        const response = await provision(sunriseAdminToken);
        expect(response.status).toBe(200);
        // Either this call did the work, or an earlier run of this same
        // idempotent suite against this DB already did — both are valid;
        // what matters below is the resulting state, not who created it.
        expect(response.body.studentsCreated.length + response.body.alreadyProvisioned.students).toBeGreaterThan(0);
        expect(response.body.parentsCreated.length + response.body.alreadyProvisioned.parents).toBeGreaterThan(0);

        // Right account for right record: Oluwaseun Adeyemi (SUN/2026/0001)
        // has a primary guardian seeded by seedPrimaryGuardian.
        const oluwaseun = await prisma.student.findFirstOrThrow({
          where: { schoolId: sunriseSchoolId, admissionNumber: "SUN/2026/0001" },
        });
        const oluwaseunAccount = await prisma.user.findFirst({ where: { studentId: oluwaseun.id } });
        expect(oluwaseunAccount).not.toBeNull();
        expect(oluwaseunAccount!.role).toBe(UserRole.STUDENT);
        expect(oluwaseunAccount!.username).toMatch(/^[A-Z]+[0-9]+$/);

        const oluwaseunPrimaryLink = await prisma.studentGuardian.findFirstOrThrow({
          where: { studentId: oluwaseun.id, isPrimary: true },
        });
        const parentAccount = await prisma.user.findFirst({ where: { guardianId: oluwaseunPrimaryLink.guardianId } });
        expect(parentAccount).not.toBeNull();
        expect(parentAccount!.role).toBe(UserRole.PARENT);
        expect(parentAccount!.username).toMatch(/^[A-Z]+$/);

        // Blended fixture (seed.ts's seedFamilyCodingFixtures): Ije Nwokolo
        // and Dapo Adeyanju share guardian "Nwokolo" despite the surname
        // difference — one family, one parent, same stem for both.
        const ije = await prisma.student.findFirstOrThrow({ where: { schoolId: sunriseSchoolId, admissionNumber: "SUN/2026/9003" } });
        const dapo = await prisma.student.findFirstOrThrow({ where: { schoolId: sunriseSchoolId, admissionNumber: "SUN/2026/9004" } });
        const ijeAccount = await prisma.user.findFirstOrThrow({ where: { studentId: ije.id } });
        const dapoAccount = await prisma.user.findFirstOrThrow({ where: { studentId: dapo.id } });
        expect(ijeAccount.username).toMatch(/^NWOKOLO[0-9]+$/);
        expect(dapoAccount.username).toMatch(/^NWOKOLO[0-9]+$/);
        expect(ijeAccount.username).not.toBe(dapoAccount.username);
        const nwokoloGuardian = await prisma.guardian.findFirstOrThrow({ where: { schoolId: sunriseSchoolId, lastName: "Nwokolo" } });
        const nwokoloParents = await prisma.user.count({ where: { guardianId: nwokoloGuardian.id, role: UserRole.PARENT } });
        expect(nwokoloParents).toBe(1);

        // Guarantee #3, school-wide: no two accounts share a username.
        const allUsernames = (
          await prisma.user.findMany({ where: { schoolId: sunriseSchoolId, username: { not: null } }, select: { username: true } })
        ).map((u) => u.username!.toUpperCase());
        expect(new Set(allUsernames).size).toBe(allUsernames.length);
      },
      120000,
    );

    it("re-running provisioning creates no duplicates and no new rows", async () => {
      const before = await prisma.user.count({ where: { schoolId: sunriseSchoolId, role: { in: [UserRole.STUDENT, UserRole.PARENT] } } });
      const response = await provision(sunriseAdminToken);
      expect(response.status).toBe(200);
      expect(response.body.studentsCreated).toHaveLength(0);
      expect(response.body.parentsCreated).toHaveLength(0);
      const after = await prisma.user.count({ where: { schoolId: sunriseSchoolId, role: { in: [UserRole.STUDENT, UserRole.PARENT] } } });
      expect(after).toBe(before);
    });

    it("two unrelated same-surname families get distinct, non-colliding codes; a new sibling only ever gets the next digit for ITS OWN family", async () => {
      const gA = await makeGuardian("Ngozi", "Coker", "910001");
      const sA1 = await makeStudent("SUN/2026/9101", "Efe", "Coker");
      await link(sA1.id, gA.id, true);

      const gB = await makeGuardian("Tunji", "Coker", "910002");
      const sB1 = await makeStudent("SUN/2026/9102", "Bisi", "Coker");
      const sB2 = await makeStudent("SUN/2026/9103", "Femi", "Coker");
      await link(sB1.id, gB.id, true);
      await link(sB2.id, gB.id, true);

      await provision(sunriseAdminToken);

      const parentA = await prisma.user.findFirstOrThrow({ where: { guardianId: gA.id } });
      const parentB = await prisma.user.findFirstOrThrow({ where: { guardianId: gB.id } });
      expect(parentA.username).not.toBe(parentB.username);
      expect(parentA.username).toMatch(/^COKER[A-Z]*$/);
      expect(parentB.username).toMatch(/^COKER[A-Z]*$/);
      // Exactly one of the two is the bare stem — the other escalated.
      expect([parentA.username, parentB.username].includes("COKER")).toBe(true);

      const sA1Account = await prisma.user.findFirstOrThrow({ where: { studentId: sA1.id } });
      const sB1Account = await prisma.user.findFirstOrThrow({ where: { studentId: sB1.id } });
      const sB2Account = await prisma.user.findFirstOrThrow({ where: { studentId: sB2.id } });

      // Family A's only child so far -> digit 1 off ITS OWN family code.
      expect(sA1Account.username).toBe(`${parentA.username}1`);
      // Family B's two children -> digits 1 and 2 off ITS OWN family code,
      // never off family A's — the anchored-regex watch-item.
      const bDigits = [sB1Account.username, sB2Account.username].sort();
      expect(bDigits).toEqual([`${parentB.username}1`, `${parentB.username}2`]);

      const capturedA1Hash = sA1Account.passwordHash;
      const capturedParentAId = parentA.id;

      // NEW e2e case: re-run after enrolling a new sibling into family A.
      const sA2 = await makeStudent("SUN/2026/9104", "Kola", "Coker");
      await link(sA2.id, gA.id, true);

      const rerun = await provision(sunriseAdminToken);
      const newForA = rerun.body.studentsCreated.filter((s: { studentId: string }) => s.studentId === sA2.id);
      expect(newForA).toHaveLength(1);
      expect(newForA[0].username).toBe(`${parentA.username}2`);

      // Stability: A1 and the parent are byte-for-byte untouched.
      const sA1AccountAfter = await prisma.user.findFirstOrThrow({ where: { studentId: sA1.id } });
      expect(sA1AccountAfter.id).toBe(sA1Account.id);
      expect(sA1AccountAfter.username).toBe(sA1Account.username);
      expect(sA1AccountAfter.passwordHash).toBe(capturedA1Hash);
      const parentAAfter = await prisma.user.findFirstOrThrow({ where: { guardianId: gA.id } });
      expect(parentAAfter.id).toBe(capturedParentAId);
      expect(parentAAfter.username).toBe(parentA.username);

      // Family B untouched by A's growth.
      const bUsernamesAfter = [
        (await prisma.user.findFirstOrThrow({ where: { studentId: sB1.id } })).username,
        (await prisma.user.findFirstOrThrow({ where: { studentId: sB2.id } })).username,
      ].sort();
      expect(bUsernamesAfter).toEqual(bDigits);
    });

    it("an only child gets FAMILYCODE1, never the bare family code (reserved for the parent)", async () => {
      const guardian = await makeGuardian("Bunmi", "Sotande", "910010");
      const student = await makeStudent("SUN/2026/9105", "Tomiwa", "Sotande");
      await link(student.id, guardian.id, true);

      await provision(sunriseAdminToken);

      const parentAccount = await prisma.user.findFirstOrThrow({ where: { guardianId: guardian.id } });
      const studentAccount = await prisma.user.findFirstOrThrow({ where: { studentId: student.id } });
      expect(parentAccount.username).toBe("SOTANDE");
      expect(studentAccount.username).toBe("SOTANDE1");
    });

    it("3+ siblings still get exactly one parent account", async () => {
      const guardian = await makeGuardian("Rita", "Balewa", "910020");
      const s1 = await makeStudent("SUN/2026/9106", "Ada", "Balewa");
      const s2 = await makeStudent("SUN/2026/9107", "Bode", "Balewa");
      const s3 = await makeStudent("SUN/2026/9108", "Chika", "Balewa");
      await link(s1.id, guardian.id, true);
      await link(s2.id, guardian.id, true);
      await link(s3.id, guardian.id, true);

      await provision(sunriseAdminToken);

      const parentCount = await prisma.user.count({ where: { guardianId: guardian.id, role: UserRole.PARENT } });
      expect(parentCount).toBe(1);
      const studentUsernames = await Promise.all(
        [s1, s2, s3].map(async (s) => (await prisma.user.findFirstOrThrow({ where: { studentId: s.id } })).username),
      );
      expect(new Set(studentUsernames).size).toBe(3);
    });

    it("a student with no guardian on record gets a STUDENT-only account and a warning, never a PARENT account", async () => {
      const student = await makeStudent("SUN/2026/9109", "Orphan", "Ajala");

      const response = await provision(sunriseAdminToken);

      const studentAccount = await prisma.user.findFirstOrThrow({ where: { studentId: student.id } });
      expect(studentAccount.role).toBe(UserRole.STUDENT);
      expect(studentAccount.username).toBe("AJALA1");
      expect(studentAccount.guardianId).toBeNull();

      const warning = response.body.warnings.find((w: { type: string; studentId?: string }) => w.type === "no_guardian" && w.studentId === student.id);
      expect(warning).toBeDefined();
    });

    it("a guardian shared across otherwise-unrelated households is flagged (child_not_covered), never silently leaked or dropped", async () => {
      const g1 = await makeGuardian("Ngozi", "Balarabe", "910030");
      const g2 = await makeGuardian("Ngozi", "Musa", "910031");

      // M1 <-G1(primary)-> is the anchor (lowest admission number).
      const m1 = await makeStudent("SUN/2026/9110", "Amaka", "Balarabe");
      await link(m1.id, g1.id, true);

      // M2 shares G1 with M1 (unions them) but its OWN primary is G2.
      const m2 = await makeStudent("SUN/2026/9111", "Ben", "Balarabe");
      await link(m2.id, g1.id, false);
      await link(m2.id, g2.id, true);

      // M3 shares ONLY G2 with M2 (unions M3 into the same family via M2)
      // but has NO link at all to the anchor guardian G1.
      const m3 = await makeStudent("SUN/2026/9112", "Cynthia", "Musa");
      await link(m3.id, g2.id, true);

      const response = await provision(sunriseAdminToken);

      // All three still get STUDENT accounts — never silently dropped.
      const m1Account = await prisma.user.findFirstOrThrow({ where: { studentId: m1.id } });
      const m2Account = await prisma.user.findFirstOrThrow({ where: { studentId: m2.id } });
      const m3Account = await prisma.user.findFirstOrThrow({ where: { studentId: m3.id } });
      expect([m1Account, m2Account, m3Account].every((a) => a.role === UserRole.STUDENT)).toBe(true);

      // Exactly one parent account for the family, anchored on G1 — never
      // one for G2 too (that would leak M3's real guardian's other wards,
      // if any, and double-provision the family).
      expect(await prisma.user.count({ where: { guardianId: g1.id, role: UserRole.PARENT } })).toBe(1);
      expect(await prisma.user.count({ where: { guardianId: g2.id, role: UserRole.PARENT } })).toBe(0);

      // M3 is flagged: grouped into the family, but not directly linked to
      // the anchor guardian G1 — it won't appear under that parent login.
      const warning = response.body.warnings.find((w: { type: string; studentId?: string }) => w.type === "child_not_covered" && w.studentId === m3.id);
      expect(warning).toBeDefined();
      // M1 and M2 ARE directly linked to G1 — no warning for them.
      expect(response.body.warnings.some((w: { studentId?: string }) => w.studentId === m1.id)).toBe(false);
      expect(response.body.warnings.some((w: { studentId?: string }) => w.studentId === m2.id)).toBe(false);
    });

    it("403 for TEACHER", async () => {
      const response = await provision(sunriseTeacherToken);
      expect(response.status).toBe(403);
    });

    it("401 unauthenticated", async () => {
      const response = await request(app.getHttpServer()).post("/api/v1/portal-accounts/provision");
      expect(response.status).toBe(401);
    });
  });

  describe("GET /portal-accounts", () => {
    it("lists provisioned accounts with role/username/displayName", async () => {
      await provision(sunriseAdminToken);
      const response = await request(app.getHttpServer()).get("/api/v1/portal-accounts?pageSize=5").set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.items[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          role: expect.stringMatching(/^(STUDENT|PARENT)$/),
          username: expect.any(String),
          displayName: expect.any(String),
        }),
      );
    });

    it("403 for TEACHER", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/portal-accounts").set(auth(sunriseTeacherToken));
      expect(response.status).toBe(403);
    });
  });

  describe("GET /portal-accounts/:id", () => {
    it("cross-tenant access 404s", async () => {
      await provision(sunriseAdminToken);
      const sunriseAccount = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseSchoolId, role: UserRole.STUDENT } });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/portal-accounts/${sunriseAccount.id}`)
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(404);
    });

    it("returns the account for the owning school's admin", async () => {
      await provision(sunriseAdminToken);
      const sunriseAccount = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseSchoolId, role: UserRole.STUDENT } });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/portal-accounts/${sunriseAccount.id}`)
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(sunriseAccount.id);
    });
  });

  describe("DB-level guarantee #3 — CHECK constraint, independent of the service", () => {
    it("rejects a STUDENT row with no student_id at the database layer", async () => {
      await expect(
        prisma.user.create({
          data: {
            schoolId: sunriseSchoolId,
            role: UserRole.STUDENT,
            username: "BADROW1",
            passwordHash: "x",
            firstName: "Bad",
            lastName: "Row",
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects a PARENT row that also carries a student_id", async () => {
      const guardian = await makeGuardian("Test", "Checkrow", "910099");
      await expect(
        prisma.$transaction(async (tx) => {
          const student = await tx.student.create({
            data: {
              schoolId: sunriseSchoolId,
              admissionNumber: "SUN/2026/9199",
              firstName: "Check",
              lastName: "Row",
              gender: "MALE",
              dateOfBirth: new Date("2014-01-01"),
              guardianName: "x",
              guardianPhone: "+2348000000001",
            },
          });
          createdStudentIds.push(student.id);
          return tx.user.create({
            data: {
              schoolId: sunriseSchoolId,
              role: UserRole.PARENT,
              username: "BADROW2",
              guardianId: guardian.id,
              studentId: student.id,
              passwordHash: "x",
              firstName: "Bad",
              lastName: "Row",
            },
          });
        }),
      ).rejects.toThrow();
    });
  });
});
