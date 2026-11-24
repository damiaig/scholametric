import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertIsTestDatabaseUrl, MAINTENANCE_DATABASE_URL, TEST_DATABASE_URL } from "./test-db";

const API_ROOT = path.join(__dirname, "..");

// MUST run with --runInBand (package.json's "test" script, same as CI) — parallel workers collide on shared fixtures in this one scholametric_test database (v0.9 Step 2c).
//
// Runs ONCE before any e2e test file (Jest globalSetup). Drops (if it
// exists) and recreates "scholametric_test" on EVERY run, then migrates and
// seeds it fresh — the SAME migrations/seed script the dev/walk stack uses,
// just against an isolated target. This also means `pnpm test`/
// `pnpm run ci` is physically incapable of writing to real seeded data in
// the dev database (docs/DECISIONS.md).
//
// v0.9 Step 2a (docs/DECISIONS.md, 2026-11-19): previously this only
// created the database if missing, so leftover rows from a prior run's
// test files that didn't clean up after themselves would still be there on
// the next run — confirmed as a major, independent source of flakiness
// (the "Arm B" no-reset-between-runs data: 100-260 failed tests per run
// from fixture-collision cascades). Always dropping and recreating closes
// that gap. `WITH (FORCE)` (Postgres 13+) also disconnects any lingering
// sessions still attached to the database, so a prior crashed run holding
// an open connection can't block this.
export default async function globalSetup(): Promise<void> {
  assertIsTestDatabaseUrl(TEST_DATABASE_URL);

  const admin = new PrismaClient({ datasources: { db: { url: MAINTENANCE_DATABASE_URL } } });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS scholametric_test WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE scholametric_test`);
  } finally {
    await admin.$disconnect();
  }

  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: API_ROOT, env, stdio: "inherit" });
  execFileSync("pnpm", ["exec", "prisma", "db", "seed"], { cwd: API_ROOT, env, stdio: "inherit" });
}
