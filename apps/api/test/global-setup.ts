import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { MAINTENANCE_DATABASE_URL, TEST_DATABASE_URL } from "./test-db";

const API_ROOT = path.join(__dirname, "..");

// Runs ONCE before any e2e test file (Jest globalSetup). Creates (if it
// doesn't already exist) a dedicated "scholametric_test" database, then
// migrates and seeds it — the SAME migrations/seed script the dev/walk
// stack uses, just against an isolated target. This is what makes
// `pnpm test`/`pnpm run ci` physically incapable of writing to real seeded
// data in the dev database (docs/DECISIONS.md).
export default async function globalSetup(): Promise<void> {
  const admin = new PrismaClient({ datasources: { db: { url: MAINTENANCE_DATABASE_URL } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE scholametric_test`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("already exists")) {
      throw error;
    }
  } finally {
    await admin.$disconnect();
  }

  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: API_ROOT, env, stdio: "inherit" });
  execFileSync("pnpm", ["exec", "prisma", "db", "seed"], { cwd: API_ROOT, env, stdio: "inherit" });
}
