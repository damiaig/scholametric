import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

// Any transaction that deliberately waits on a Postgres-level lock —
// originally just the advisory-lock sites (grades/terms/exams/students/
// personnel/portal-accounts, v0.9 Step 2b), extended in Step 2c to the two
// ordinary row-lock sites (auth#refresh's atomic updateMany,
// student-guardians#setPrimary's SELECT...FOR UPDATE) that have the exact
// same unprotected-wait gap — shares these three values so no call site
// can silently omit a timeout and fall back to Prisma's much shorter
// defaults (maxWait 2s, timeout 5s). See docs/DECISIONS.md.
//
// - MAX_WAIT_MS: time to even START the transaction (acquire a pool slot).
// - LOCK_TIMEOUT_MS: SET LOCAL lock_timeout — the actual fix. Diagnostic #1
//   (docs/DECISIONS.md, 2026-11-20) proved Prisma's own `timeout` option
//   does NOT interrupt a connection blocked inside a lock wait (advisory
//   OR an ordinary row lock) — it only notices the deadline passed once
//   the blocking call eventually returns on its own. A real Postgres-side
//   lock_timeout is the only thing that actually bounds the wait.
//   Env-overridable so tests can use a short value without changing
//   production behavior.
// - TX_TIMEOUT_MS: overall transaction budget once running, now mostly a
//   backstop for slow non-lock work (recompute cascades), since
//   lock_timeout bounds the lock wait itself.
export const MAX_WAIT_MS = 10_000;
export const LOCK_TIMEOUT_MS = Number(process.env.LOCK_TIMEOUT_MS ?? 5_000);
export const TX_TIMEOUT_MS = 20_000;

if (!Number.isInteger(LOCK_TIMEOUT_MS) || LOCK_TIMEOUT_MS <= 0) {
  throw new Error(`LOCK_TIMEOUT_MS must be a positive integer, got: ${process.env.LOCK_TIMEOUT_MS}`);
}

/**
 * Wraps a lock-holding transaction (advisory or an ordinary row lock): sets
 * a Postgres-side lock_timeout as the FIRST statement — before the
 * caller's own lock-acquiring call, whichever form it takes — then runs
 * the caller's callback unchanged. Every one of this codebase's
 * lock-holding transactions uses this instead of calling
 * prisma.$transaction directly — see docs/DECISIONS.md, v0.9 Step 2b/2c
 * for the full inventory of call sites.
 */
export async function runLockedTransaction<T>(
  prisma: PrismaService,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
      return callback(tx);
    },
    { maxWait: MAX_WAIT_MS, timeout: TX_TIMEOUT_MS },
  );
}
