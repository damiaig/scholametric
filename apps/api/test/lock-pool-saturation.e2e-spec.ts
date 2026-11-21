import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";

// v0.9 Step 2b (docs/DECISIONS.md) — the small-pool concurrency repro
// from Step 1, kept as a real test instead of a throwaway script. This
// does NOT assert exact success/failure counts (those depend on exact
// timing and pool contention, which varies run to run and machine to
// machine — the 2b acceptance criteria track that separately, over many
// runs under the real harness). What this DOES assert, deterministically:
// every single request resolves to EITHER a real success OR one of the
// two mapped, documented error shapes (409 "another save in progress" /
// 503 "server busy") — never an unmapped 500, never a raw hang — and the
// whole batch finishes within a generous but bounded time, proving the
// fix (SET LOCAL lock_timeout + the exception-filter mapping) holds under
// real contention, not just in the single-request regression test.
describe("Lock/pool saturation under concurrency (e2e)", () => {
  let app: INestApplication;
  let token: string;
  const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

  beforeAll(async () => {
    // Forces real contention regardless of how this suite is invoked —
    // at the default local pool (~21) this test's concurrency wouldn't
    // reliably saturate anything. PrismaClient reads DATABASE_URL at
    // construction time (inside createTestApp's fresh DI container),
    // not at module load, so overriding it here (unlike
    // locked-transaction.ts's module-level LOCK_TIMEOUT_MS constant)
    // needs no module-cache trick.
    const base = ORIGINAL_DATABASE_URL!;
    process.env.DATABASE_URL = base.includes("?") ? `${base}&connection_limit=3` : `${base}?connection_limit=3`;
    app = await createTestApp();
    token = await loginAs(app, "admin@sunrise.test", "sunrise");
  }, 20000);

  afterAll(async () => {
    await app.close();
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  });

  it("every concurrent request on the same lock key ends as a success or a mapped error, none hangs", async () => {
    const CONCURRENCY = 40;
    const TIME_BOUND_MS = 20000;

    const start = Date.now();
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        request(app.getHttpServer())
          .post("/api/v1/personnel")
          .set("Authorization", `Bearer ${token}`)
          .send({
            email: `saturation.${i}.${randomUUID()}@sunrise.test`,
            firstName: "Saturation",
            lastName: `Staff${i}`,
            role: "TEACHER",
            jobTitle: "TEACHER",
            password: "Passw0rd!",
          }),
      ),
    );
    const elapsedMs = Date.now() - start;

    const outcomeClasses = results.map((response) => {
      if (response.status === 201) return "success" as const;
      if (response.status === 409 && response.body?.retryable === true) return "mapped-409" as const;
      if (response.status === 503 && response.body?.retryable === true) return "mapped-503" as const;
      return `UNEXPECTED:${response.status}:${JSON.stringify(response.body)}` as const;
    });

    const unexpected = outcomeClasses.filter((c) => c.startsWith("UNEXPECTED"));
    expect(unexpected).toEqual([]);
    expect(outcomeClasses).toHaveLength(CONCURRENCY);
    expect(elapsedMs).toBeLessThan(TIME_BOUND_MS);
  }, 30000);
});
