import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// v0.9 Step 2c (docs/DECISIONS.md) — deterministic regression for
// student-guardians#setPrimary's row lock, the second of the two
// unprotected-wait sites found during Step 2c's broader audit (the other
// is auth#refresh, see auth-refresh-lock-timeout.e2e-spec.ts). Same shape
// as lock-timeout-regression.e2e-spec.ts (which proved the mechanism for
// the ORIGINAL advisory-lock sites): a request blocked on the
// `SELECT ... FOR UPDATE` setPrimary takes must get the mapped 409 in
// roughly LOCK_TIMEOUT_MS, not hang.
describe("student-guardians#setPrimary row-lock timeout regression (e2e)", () => {
  let app: INestApplication;
  let token: string;
  let studentId: string;
  let guardianId: string;

  const ORIGINAL_LOCK_TIMEOUT_MS = process.env.LOCK_TIMEOUT_MS;

  beforeAll(async () => {
    process.env.LOCK_TIMEOUT_MS = "500";
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createTestApp } = require("./utils/create-test-app");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loginAs } = require("./utils/login");

    app = await createTestApp();
    token = await loginAs(app, "admin@sunrise.test", "sunrise");

    const created = await request(app.getHttpServer())
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${token}`)
      .send({
        firstName: "Regress",
        lastName: `Student-${randomUUID().slice(0, 8)}`,
        gender: "MALE",
        dateOfBirth: "2012-05-01",
        guardians: [{ firstName: "Test", lastName: "Guardian", phone: "+2348010009999", relationship: "MOTHER" }],
        classArmId: (
          await request(app.getHttpServer())
            .get("/api/v1/classes")
            .set("Authorization", `Bearer ${token}`)
        ).body[0].arms[0].id,
      });
    studentId = created.body.id;
    const links = await request(app.getHttpServer())
      .get(`/api/v1/students/${studentId}/guardians`)
      .set("Authorization", `Bearer ${token}`);
    guardianId = links.body[0].guardianId;
  }, 20000);

  afterAll(async () => {
    await app.close();
    if (ORIGINAL_LOCK_TIMEOUT_MS === undefined) {
      delete process.env.LOCK_TIMEOUT_MS;
    } else {
      process.env.LOCK_TIMEOUT_MS = ORIGINAL_LOCK_TIMEOUT_MS;
    }
  });

  it("returns the mapped 409 in ~lock_timeout (500ms), not 30s, when the student's guardian-link rows are already locked", async () => {
    const holder = new PrismaClient();
    // setPrimary's own first statement is
    // `SELECT id FROM student_guardians WHERE student_id = $1 ORDER BY id FOR UPDATE`
    // — holding that exact lock externally for 1.5s forces the real
    // request below to block on it.
    const holderPromise = holder.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM student_guardians WHERE student_id = ${studentId}::uuid ORDER BY id FOR UPDATE`;
        await sleep(1500);
      },
      { timeout: 15000 },
    );
    await sleep(200); // let the holder actually acquire the row lock first

    const start = Date.now();
    const response = await request(app.getHttpServer())
      .put(`/api/v1/students/${studentId}/guardians/${guardianId}/primary`)
      .set("Authorization", `Bearer ${token}`);
    const elapsedMs = Date.now() - start;

    expect(response.status).toBe(409);
    expect(response.body.retryable).toBe(true);
    expect(response.body.message).toBe(
      "Another save for this record is already in progress. Please try again in a moment.",
    );
    expect(elapsedMs).toBeGreaterThan(350);
    expect(elapsedMs).toBeLessThan(1200);

    await holderPromise;
    await holder.$disconnect();
  }, 15000);
});
