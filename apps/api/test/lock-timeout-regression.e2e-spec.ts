import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// v0.9 Step 2b (docs/DECISIONS.md) — deterministic regression for the
// SET LOCAL lock_timeout fix: a request blocked waiting on an
// already-held advisory lock must get the mapped 409 in roughly
// LOCK_TIMEOUT_MS, not after Prisma's much longer `timeout`/`maxWait`
// (diagnostic #1 proved those never actually interrupt a blocked lock
// wait) and nowhere near a real hang.
//
// LOCK_TIMEOUT_MS is overridden to 500ms here (common/prisma/
// locked-transaction.ts reads it once at module load) so this test runs
// in milliseconds, not minutes, while still exercising the exact same
// mechanism production uses at its default of 5000ms. The override has
// to be set, and the modules that transitively read it re-required,
// BEFORE this file's own beforeAll touches anything that imports
// locked-transaction.ts (createTestApp -> AppModule -> every feature
// module) — a static top-level import would already have been
// evaluated with whatever LOCK_TIMEOUT_MS was set (or defaulted to)
// before this file's own code ever ran.
describe("Advisory-lock timeout regression (e2e)", () => {
  let app: INestApplication;
  let token: string;
  let schoolId: string;

  const ORIGINAL_LOCK_TIMEOUT_MS = process.env.LOCK_TIMEOUT_MS;

  beforeAll(async () => {
    process.env.LOCK_TIMEOUT_MS = "500";
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createTestApp } = require("./utils/create-test-app");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loginAs } = require("./utils/login");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaService } = require("../src/prisma/prisma.service");

    app = await createTestApp();
    token = await loginAs(app, "admin@sunrise.test", "sunrise");
    const prisma = app.get(PrismaService);
    schoolId = (await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } })).id;
  }, 20000);

  afterAll(async () => {
    await app.close();
    if (ORIGINAL_LOCK_TIMEOUT_MS === undefined) {
      delete process.env.LOCK_TIMEOUT_MS;
    } else {
      process.env.LOCK_TIMEOUT_MS = ORIGINAL_LOCK_TIMEOUT_MS;
    }
  });

  it("returns the mapped 409 in ~lock_timeout (500ms), not 30s, when the lock is already held", async () => {
    const holder = new PrismaClient();
    // Holds the EXACT lock key POST /personnel takes ("{schoolId}:staff")
    // for 1.5s — comfortably longer than the 500ms lock_timeout, so the
    // waiter below is guaranteed to hit it, and comfortably shorter than
    // this test's own 15s jest timeout.
    const holderPromise = holder.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('${schoolId}:staff'))`);
        await sleep(1500);
      },
      { timeout: 15000 },
    );
    await sleep(200); // let the holder actually acquire the lock first

    const start = Date.now();
    const response = await request(app.getHttpServer())
      .post("/api/v1/personnel")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: `regress-${Date.now()}@sunrise.test`,
        firstName: "Regress",
        lastName: "Staff",
        role: "TEACHER",
        jobTitle: "TEACHER",
        password: "Passw0rd!",
      });
    const elapsedMs = Date.now() - start;

    expect(response.status).toBe(409);
    expect(response.body.retryable).toBe(true);
    expect(response.body.message).toBe(
      "Another save for this record is already in progress. Please try again in a moment.",
    );
    // "Around lock_timeout" per the plan: well short of the holder's
    // full 1.5s hold (proving it didn't just wait the hold out), and
    // nowhere near a 30s-style hang. Not a wide window — this is the
    // whole point of the fix.
    expect(elapsedMs).toBeGreaterThan(350);
    expect(elapsedMs).toBeLessThan(1200);

    await holderPromise;
    await holder.$disconnect();
  }, 15000);
});
