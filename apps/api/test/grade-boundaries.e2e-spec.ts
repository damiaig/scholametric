import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

const WAEC_SET = [
  { grade: "A1", minScore: 75, maxScore: 100, remark: "Excellent", sortOrder: 1 },
  { grade: "B2", minScore: 70, maxScore: 74, remark: "Very Good", sortOrder: 2 },
  { grade: "B3", minScore: 65, maxScore: 69, remark: "Good", sortOrder: 3 },
  { grade: "C4", minScore: 60, maxScore: 64, remark: "Credit", sortOrder: 4 },
  { grade: "C5", minScore: 55, maxScore: 59, remark: "Credit", sortOrder: 5 },
  { grade: "C6", minScore: 50, maxScore: 54, remark: "Credit", sortOrder: 6 },
  { grade: "D7", minScore: 45, maxScore: 49, remark: "Pass", sortOrder: 7 },
  { grade: "E8", minScore: 40, maxScore: 44, remark: "Pass", sortOrder: 8 },
  { grade: "F9", minScore: 0, maxScore: 39, remark: "Fail", sortOrder: 9 },
];

describe("Grade boundaries + grading presets (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let sunriseSchoolId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");
    sunriseSchoolId = (await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } })).id;
  });

  afterAll(async () => {
    // Restore the seeded WAEC set — same reasoning as
    // assessment-components.e2e-spec.ts's afterAll.
    await prisma.gradeBoundary.deleteMany({ where: { schoolId: sunriseSchoolId } });
    for (const boundary of WAEC_SET) {
      await prisma.gradeBoundary.create({ data: { schoolId: sunriseSchoolId, ...boundary } });
    }
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe("GET /grade-boundaries", () => {
    it("returns the seeded WAEC set ordered by sortOrder, tiling 0-100", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grade-boundaries")
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.map((b: { grade: string }) => b.grade)).toEqual([
        "A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9",
      ]);
      // Ordered by sortOrder (A1 first), not by score — the lowest score
      // band (F9) is last in this ordering, the highest (A1) is first.
      expect(response.body[0].maxScore).toBe(100);
      expect(response.body[response.body.length - 1].minScore).toBe(0);
    });

    it("TEACHER can read (resolution 7)", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grade-boundaries")
        .set(auth(sunriseTeacherToken));
      expect(response.status).toBe(200);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/grade-boundaries");
      expect(response.status).toBe(401);
    });
  });

  describe("PUT /grade-boundaries", () => {
    it("rejects a gap (missing 45-49) and leaves the prior set intact", async () => {
      const withGap = WAEC_SET.filter((b) => b.grade !== "D7");
      const response = await request(app.getHttpServer())
        .put("/api/v1/grade-boundaries")
        .set(auth(sunriseAdminToken))
        .send({ boundaries: withGap });
      expect(response.status).toBe(400);

      const stillThere = await request(app.getHttpServer())
        .get("/api/v1/grade-boundaries")
        .set(auth(sunriseAdminToken));
      expect(stillThere.body.map((b: { grade: string }) => b.grade)).toEqual([
        "A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9",
      ]);
    });

    it("rejects an overlap", async () => {
      const withOverlap = WAEC_SET.map((b) => (b.grade === "D7" ? { ...b, minScore: 44 } : b));
      const response = await request(app.getHttpServer())
        .put("/api/v1/grade-boundaries")
        .set(auth(sunriseAdminToken))
        .send({ boundaries: withOverlap });
      expect(response.status).toBe(400);
    });

    it("rejects duplicate grades", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grade-boundaries")
        .set(auth(sunriseAdminToken))
        .send({
          boundaries: [
            { grade: "A", minScore: 0, maxScore: 50, remark: "x", sortOrder: 1 },
            { grade: "A", minScore: 51, maxScore: 100, remark: "y", sortOrder: 2 },
          ],
        });
      expect(response.status).toBe(400);
    });

    it("rejects a set that doesn't start at 0 or end at 100", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grade-boundaries")
        .set(auth(sunriseAdminToken))
        .send({
          boundaries: [
            { grade: "A", minScore: 1, maxScore: 50, remark: "x", sortOrder: 1 },
            { grade: "B", minScore: 51, maxScore: 99, remark: "y", sortOrder: 2 },
          ],
        });
      expect(response.status).toBe(400);
    });

    it("accepts the WAEC set", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grade-boundaries")
        .set(auth(sunriseAdminToken))
        .send({ boundaries: WAEC_SET });
      expect(response.status).toBe(200);
      expect(response.body.map((b: { grade: string }) => b.grade)).toEqual([
        "A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9",
      ]);
    });

    it("TEACHER gets 403 on PUT despite being able to read", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grade-boundaries")
        .set(auth(sunriseTeacherToken))
        .send({ boundaries: WAEC_SET });
      expect(response.status).toBe(403);
    });

    it("a school's PUT never affects another school's set", async () => {
      const before = await request(app.getHttpServer())
        .get("/api/v1/grade-boundaries")
        .set(auth(hillcrestAdminToken));

      await request(app.getHttpServer())
        .put("/api/v1/grade-boundaries")
        .set(auth(sunriseAdminToken))
        .send({ boundaries: WAEC_SET });

      const after = await request(app.getHttpServer())
        .get("/api/v1/grade-boundaries")
        .set(auth(hillcrestAdminToken));
      expect(after.body).toEqual(before.body);
    });
  });

  describe("GET /grading-presets", () => {
    it("returns both static preset tables", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grading-presets")
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.waec9Point).toHaveLength(9);
      expect(response.body.simpleAToF.length).toBeGreaterThanOrEqual(2);
      expect(response.body.waec9Point[0].grade).toBe("A1");
    });

    it("TEACHER is forbidden", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grading-presets")
        .set(auth(sunriseTeacherToken));
      expect(response.status).toBe(403);
    });
  });
});
