import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CSRF_HEADER = { "X-Requested-With": "XMLHttpRequest" };

function findSetCookie(response: request.Response, name: string): string | undefined {
  const raw = response.headers["set-cookie"] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((c) => c.startsWith(`${name}=`));
}

function rawCookieValue(setCookieString: string): string {
  return setCookieString.split(";")[0].split("=")[1];
}

// v0.9 Step 2c (docs/DECISIONS.md) — deterministic regression for
// auth#refresh's row lock, the first of the two unprotected-wait sites
// found during Step 2c's broader audit. LOCK_TIMEOUT_MS is overridden to
// 500ms the same way lock-timeout-regression.e2e-spec.ts does (resetModules
// + require, since it's a module-level constant read once at import time).
//
// Proves the HARD REQUIREMENT from the 2c plan: a retryable 409 from
// /auth/refresh must not be treated as "this session is dead." Specifically
// proves the client-visible shape of that: a request blocked on the SAME
// row another refresh is actively rotating gets the mapped 409 fast, and a
// RETRY using whatever cookie is current by then (the other request's
// freshly-rotated one, exactly what a real browser's cookie jar would hand
// the client automatically) succeeds cleanly — the family is never
// revoked anywhere in this sequence.
describe("auth#refresh row-lock timeout regression (e2e)", () => {
  let app: INestApplication;
  let prisma: InstanceType<typeof PrismaClient>;
  let adminUserId: string;
  let generateOpaqueToken: () => string;
  let hashToken: (value: string) => string;

  const ORIGINAL_LOCK_TIMEOUT_MS = process.env.LOCK_TIMEOUT_MS;

  beforeAll(async () => {
    process.env.LOCK_TIMEOUT_MS = "500";
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createTestApp } = require("./utils/create-test-app");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaService } = require("../src/prisma/prisma.service");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tokenUtil = require("../src/auth/refresh-token.util");
    generateOpaqueToken = tokenUtil.generateOpaqueToken;
    hashToken = tokenUtil.hashToken;

    app = await createTestApp();
    prisma = app.get(PrismaService);
    const admin = await prisma.user.findFirstOrThrow({ where: { email: "admin@sunrise.test" } });
    adminUserId = admin.id;
  }, 20000);

  afterAll(async () => {
    await app.close();
    if (ORIGINAL_LOCK_TIMEOUT_MS === undefined) {
      delete process.env.LOCK_TIMEOUT_MS;
    } else {
      process.env.LOCK_TIMEOUT_MS = ORIGINAL_LOCK_TIMEOUT_MS;
    }
  });

  function refresh(cookieValue: string) {
    return request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", `refreshToken=${cookieValue}`).set(CSRF_HEADER);
  }

  it("a request blocked on the token's row gets the mapped 409 fast, and retrying with the current (other request's) cookie succeeds, with NO family revocation", async () => {
    const rawTokenA = generateOpaqueToken();
    const familyId = randomUUID();
    const planted = await prisma.refreshToken.create({
      data: {
        userId: adminUserId,
        familyId,
        familySequence: 0,
        tokenHash: hashToken(rawTokenA),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Holds token A's own row for 1.5s — simulates "another request is
    // already mid-rotation on this exact token" deterministically, rather
    // than racing on real concurrency timing.
    const holder = new PrismaClient();
    const holderPromise = holder.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM refresh_tokens WHERE id = ${planted.id}::uuid FOR UPDATE`;
        await sleep(1500);
      },
      { timeout: 15000 },
    );
    await sleep(200); // let the holder actually acquire the row lock first

    const start = Date.now();
    const blocked = await refresh(rawTokenA);
    const elapsedMs = Date.now() - start;

    expect(blocked.status).toBe(409);
    expect(blocked.body.retryable).toBe(true);
    expect(blocked.body.message).toBe(
      "Another save for this record is already in progress. Please try again in a moment.",
    );
    expect(elapsedMs).toBeGreaterThan(350);
    expect(elapsedMs).toBeLessThan(1200);

    await holderPromise;
    await holder.$disconnect();

    // The row lock is free now — a real concurrent request using the SAME
    // token (the one the blocked attempt above raced against) completes
    // its rotation normally. This is the "winner" whose fresh cookie a
    // real browser's cookie jar would already hold by the time a client
    // retries the blocked attempt.
    const winner = await refresh(rawTokenA);
    expect(winner.status).toBe(200);
    const winnerCookie = rawCookieValue(findSetCookie(winner, "refreshToken")!);

    // The client's retry (after the 409 above) uses whatever cookie is
    // CURRENT — the winner's — exactly as api-client.ts's refreshTokens()
    // does (a fresh fetch, not a snapshot of the original request).
    const retry = await refresh(winnerCookie);
    expect(retry.status).toBe(200);
    const retryCookie = rawCookieValue(findSetCookie(retry, "refreshToken")!);

    // No family revocation anywhere in this sequence: the latest cookie
    // still works.
    const followUp = await refresh(retryCookie);
    expect(followUp.status).toBe(200);
  }, 15000);
});
