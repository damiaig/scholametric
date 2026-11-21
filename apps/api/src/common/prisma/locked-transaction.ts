import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

// Advisory-lock-holding transactions (grades/terms/exams/students/personnel/
// portal-accounts) share these three values so no call site can silently
// omit a timeout and fall back to Prisma's much shorter defaults
// (maxWait 2s, timeout 5s) — see docs/DECISIONS.md, v0.9 Step 2b.
//
// - MAX_WAIT_MS: time to even START the transaction (acquire a pool slot).
// - LOCK_TIMEOUT_MS: SET LOCAL lock_timeout — the actual fix. Diagnostic #1
//   (docs/DECISIONS.md, 2026-11-20) proved Prisma's own `timeout` option
//   does NOT interrupt a connection blocked inside pg_advisory_xact_lock —
//   it only notices the deadline passed once the blocking call eventually
//   returns on its own. A real Postgres-side lock_timeout is the only
//   thing that actually bounds the wait. Env-overridable so tests can use
//   a short value without changing production behavior.
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
 * Wraps an advisory-lock-holding transaction: sets a Postgres-side
 * lock_timeout as the FIRST statement (before the caller's own
 * pg_advisory_xact_lock call), then runs the caller's callback unchanged.
 * Every one of this codebase's lock-holding transactions uses this instead
 * of calling prisma.$transaction directly — see docs/DECISIONS.md, v0.9
 * Step 2b for the full inventory of call sites.
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
