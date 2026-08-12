import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";

const SEEDED_COMPONENTS = [
  { name: "CA 1", weight: 20, sortOrder: 1, maxScore: 20, requiresApproval: false },
  { name: "CA 2", weight: 20, sortOrder: 2, maxScore: 20, requiresApproval: false },
  { name: "Exam", weight: 60, sortOrder: 3, maxScore: 100, requiresApproval: true },
];

describe("Assessment components (e2e)", () => {
  let app: INestApplication;
  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");
  });

  afterAll(async () => {
    // Restore the seeded set through the real endpoint, not a raw hard
    // delete — once student_scores can reference these rows (SPEC_V0.4.md
    // §1), a raw deleteMany FK-violates. PUT already handles this
    // correctly (soft-deletes any removed component with referencing
    // scores instead of destroying it), which is exactly what's needed
    // here since prior tests in this suite may have left a set that no
    // longer matches the originally-seeded rows other suites rely on.
    await request(app.getHttpServer())
      .put("/api/v1/assessment-components")
      .set(auth(sunriseAdminToken))
      .send({ components: SEEDED_COMPONENTS });
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe("GET /assessment-components", () => {
    it("returns the seeded set ordered by sortOrder", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.map((c: { name: string }) => c.name)).toEqual(["CA 1", "CA 2", "Exam"]);
      expect(response.body.reduce((sum: number, c: { weight: number }) => sum + c.weight, 0)).toBe(100);
    });

    it("TEACHER is forbidden (read is admin-only here, unlike grade-boundaries)", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(sunriseTeacherToken));
      expect(response.status).toBe(403);
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
    it("rejects a 90-total set, and leaves the prior set intact", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(sunriseAdminToken))
        .send({ components: [{ name: "CA 1", weight: 40, sortOrder: 1 }, { name: "Exam", weight: 50, sortOrder: 2 }] });
      expect(response.status).toBe(400);

      const stillThere = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(sunriseAdminToken));
      expect(stillThere.body.map((c: { name: string }) => c.name)).toEqual(["CA 1", "CA 2", "Exam"]);
    });

    it("rejects a 110-total set atomically", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(sunriseAdminToken))
        .send({ components: [{ name: "CA 1", weight: 60, sortOrder: 1 }, { name: "Exam", weight: 50, sortOrder: 2 }] });
      expect(response.status).toBe(400);

      const stillThere = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(sunriseAdminToken));
      expect(stillThere.body.map((c: { name: string }) => c.name)).toEqual(["CA 1", "CA 2", "Exam"]);
    });

    it("rejects duplicate names", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(sunriseAdminToken))
        .send({ components: [{ name: "CA", weight: 50, sortOrder: 1 }, { name: "CA", weight: 50, sortOrder: 2 }] });
      expect(response.status).toBe(400);
    });

    it("rejects more than 8 components", async () => {
      const components = Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, weight: 100 / 9, sortOrder: i }));
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(sunriseAdminToken))
        .send({ components });
      expect(response.status).toBe(400);
    });

    it("accepts a valid 100-total set and replaces the prior one", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(sunriseAdminToken))
        .send({
          components: [
            { name: "First CA", weight: 30, sortOrder: 1 },
            { name: "Second CA", weight: 30, sortOrder: 2 },
            { name: "Final Exam", weight: 40, sortOrder: 3 },
          ],
        });
      expect(response.status).toBe(200);
      expect(response.body.map((c: { name: string }) => c.name)).toEqual(["First CA", "Second CA", "Final Exam"]);

      const persisted = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(sunriseAdminToken));
      expect(persisted.body.map((c: { name: string }) => c.name)).toEqual(["First CA", "Second CA", "Final Exam"]);
    });

    it("TEACHER cannot PUT", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(sunriseTeacherToken))
        .send({ components: SEEDED_COMPONENTS });
      expect(response.status).toBe(403);
    });

    it("a school's PUT never affects another school's set", async () => {
      const before = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(hillcrestAdminToken));

      await request(app.getHttpServer())
        .put("/api/v1/assessment-components")
        .set(auth(sunriseAdminToken))
        .send({ components: SEEDED_COMPONENTS });

      const after = await request(app.getHttpServer())
        .get("/api/v1/assessment-components")
        .set(auth(hillcrestAdminToken));
      expect(after.body).toEqual(before.body);
    });
  });
});
