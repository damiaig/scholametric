import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// A baseline structure for the scratch school's PUT tests below — same
// shape as seed.ts's real Sunrise structure, but this one lives entirely
// in the scratch tenant, never Sunrise.
const BASELINE_COMPONENTS = [
  { name: "CA 1", weight: 20, sortOrder: 1, maxScore: 20, requiresApproval: false },
  { name: "CA 2", weight: 20, sortOrder: 2, maxScore: 20, requiresApproval: false },
  { name: "Exam", weight: 60, sortOrder: 3, maxScore: 100, requiresApproval: true },
];

describe("Assessment components (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let scratchAdminToken: string;
  let scratchSchoolId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    // Every PUT test below runs against a dedicated scratch school, not
    // the real seeded Sunrise tenant. assessment_components is school-wide
    // (no session/term/class-arm to scope a scratch bundle into the way
    // every other grades e2e spec does — see terms.e2e-spec.ts's
    // createScratchBundle) — isolating this suite means a whole fresh
    // school, not just fresh sub-resources within Sunrise. Mutating the
    // real Sunrise structure here previously left it corrupted (fresh
    // component ids, orphaned soft-deleted originals) for anyone using
    // the persistent local dev DB for manual QA/demos after a full test
    // run — see docs/DECISIONS.md.
    const superAdminToken = await loginAs(app, "super@scholametric.test", "platform");
    const suffix = randomUUID().slice(0, 8);
    const schoolResponse = await request(app.getHttpServer())
      .post("/api/v1/schools")
      .set(auth(superAdminToken))
      .send({
        name: `Assessment Components E2E ${suffix}`,
        slug: `ac-e2e-${suffix}`,
        type: "SECONDARY",
        admin: { email: `admin-${suffix}@ac-e2e.test`, firstName: "Scratch", lastName: "Admin", password: SEED_PASSWORD },
      });
    scratchSchoolId = schoolResponse.body.id;
    scratchAdminToken = await loginAs(app, schoolResponse.body.admin.email, schoolResponse.body.slug);

    // A brand-new school starts with zero assessment components — seed
    // the scratch tenant's own baseline once, the same role
    // prisma/seed.ts plays for the real Sunrise structure.
    await request(app.getHttpServer())
      .put("/api/v1/assessment-components")
      .set(auth(scratchAdminToken))
      .send({ components: BASELINE_COMPONENTS });
  });

  afterAll(async () => {
    await prisma.assessmentComponent.deleteMany({ where: { schoolId: scratchSchoolId } });
    // refresh_tokens and audit_logs both FK to users — loginAs() and every
    // @Audit()-decorated PUT above created rows referencing the scratch
    // admin, so both have to go before the user does.
    await prisma.refreshToken.deleteMany({ where: { user: { schoolId: scratchSchoolId } } });
    await prisma.auditLog.deleteMany({ where: { schoolId: scratchSchoolId } });
    await prisma.user.deleteMany({ where: { schoolId: scratchSchoolId } });
    await prisma.school.delete({ where: { id: scratchSchoolId } });
    await app.close();
  });

  describe("GET /assessment-components", () => {
    it("returns the seeded set ordered by sortOrder", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.map((c: { name: string }) => c.name)).toEqual(["CA 1", "CA 2", "Exam"]);
      expect(response.body.reduce((sum: number, c: { weight: number }) => sum + c.weight, 0)).toBe(100);
    });

    it("TEACHER can read (v0.4 step 4: the score-entry grid's component picker needs this)", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(sunriseTeacherToken));
      expect(response.status).toBe(200);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/assessment-components");
      expect(response.status).toBe(401);
    });

    it("a second school's admin sees only its own set", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.reduce((sum: number, c: { weight: number }) => sum + c.weight, 0)).toBe(100);
    });
  });

  describe("PUT /assessment-components", () => {
    // Every test in this block runs against the scratch school seeded
    // with BASELINE_COMPONENTS in the outer beforeAll — never Sunrise.
    it("rejects a 90-total set, and leaves the prior set intact", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(scratchAdminToken))
        .send({ components: [{ name: "CA 1", weight: 40, sortOrder: 1 }, { name: "Exam", weight: 50, sortOrder: 2 }] });
      expect(response.status).toBe(400);

      const stillThere = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(scratchAdminToken));
      expect(stillThere.body.map((c: { name: string }) => c.name)).toEqual(["CA 1", "CA 2", "Exam"]);
    });

    it("rejects a 110-total set atomically", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(scratchAdminToken))
        .send({ components: [{ name: "CA 1", weight: 60, sortOrder: 1 }, { name: "Exam", weight: 50, sortOrder: 2 }] });
      expect(response.status).toBe(400);

      const stillThere = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(scratchAdminToken));
      expect(stillThere.body.map((c: { name: string }) => c.name)).toEqual(["CA 1", "CA 2", "Exam"]);
    });

    it("rejects duplicate names", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(scratchAdminToken))
        .send({ components: [{ name: "CA", weight: 50, sortOrder: 1, requiresApproval: true }, { name: "CA", weight: 50, sortOrder: 2 }] });
      expect(response.status).toBe(400);
    });

    it("rejects more than 8 components", async () => {
      const components = Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, weight: 100 / 9, sortOrder: i, requiresApproval: i === 0 }));
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(scratchAdminToken))
        .send({ components });
      expect(response.status).toBe(400);
    });

    it("accepts a valid 100-total set and replaces the prior one", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(scratchAdminToken))
        .send({
          components: [
            { name: "First CA", weight: 30, sortOrder: 1 },
            { name: "Second CA", weight: 30, sortOrder: 2 },
            { name: "Final Exam", weight: 40, sortOrder: 3, requiresApproval: true },
          ],
        });
      expect(response.status).toBe(200);
      expect(response.body.map((c: { name: string }) => c.name)).toEqual(["First CA", "Second CA", "Final Exam"]);

      const persisted = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(scratchAdminToken));
      expect(persisted.body.map((c: { name: string }) => c.name)).toEqual(["First CA", "Second CA", "Final Exam"]);
    });

    // Gap-1 fix (SPEC_V0.5.md §3/Q7): a structure with zero approval
    // components can never leave DRAFT (docs/DECISIONS.md).
    it("rejects a zero-approval-component set atomically, and leaves the prior set intact", async () => {
      const before = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(scratchAdminToken));

      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(scratchAdminToken))
        .send({
          components: [
            { name: "Gap1 CA", weight: 40, sortOrder: 1, requiresApproval: false },
            { name: "Gap1 Exam", weight: 60, sortOrder: 2 },
          ],
        });
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/at least one component must require approval/i);

      const stillThere = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(scratchAdminToken));
      expect(stillThere.body).toEqual(before.body);
    });

    it("accepts a set with exactly one requiresApproval component", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(scratchAdminToken))
        .send({
          components: [
            { name: "Gap1 CA Only", weight: 40, sortOrder: 1, requiresApproval: false },
            { name: "Gap1 Exam Only", weight: 60, sortOrder: 2, requiresApproval: true },
          ],
        });
      expect(response.status).toBe(200);
      const exam = response.body.find((c: { name: string }) => c.name === "Gap1 Exam Only");
      expect(exam.requiresApproval).toBe(true);
    });

    // Role check only (RolesGuard rejects before the request reaches any
    // tenant-scoped logic) — reusing the real seeded sunriseTeacherToken
    // here is safe, it never touches Sunrise's (or the scratch school's)
    // actual data.
    it("TEACHER cannot PUT", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(sunriseTeacherToken))
        .send({ components: BASELINE_COMPONENTS });
      expect(response.status).toBe(403);
    });

    it("a school's PUT never affects another school's set", async () => {
      const before = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(hillcrestAdminToken));

      await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(scratchAdminToken))
        .send({ components: BASELINE_COMPONENTS });

      const after = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(hillcrestAdminToken));
      expect(after.body).toEqual(before.body);
    });
  });
});
