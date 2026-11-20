// e2e tests must run against a DEDICATED, disposable database — never the
// same "scholametric" database the seeded dev/walk stack uses. Through
// v0.6 the e2e suite connected to that exact database (see
// docs/DECISIONS.md), which let a test silently mutate real seeded rows.
// global-setup.ts creates + migrates + seeds TEST_DATABASE_URL once before
// any test file runs; setup-env.ts forces every test file's DATABASE_URL
// here regardless of the ambient shell environment.
//
// Derived from the ambient DATABASE_URL — swapping ONLY the database name
// — rather than a hardcoded host/port. A literal `localhost:5433` here was
// a real, 100%-reproducible CI bug (docs/DECISIONS.md): local dev's
// docker-compose maps postgres to host port 5433 to avoid colliding with a
// host-native Postgres, but CI's service container publishes the standard
// 5432, so nothing was ever listening on 5433 in CI. Deriving from
// whatever DATABASE_URL the environment actually provides means the exact
// same code targets 5433 locally and 5432 in CI with zero branching.
const LOCAL_DEFAULT_DATABASE_URL = "postgresql://scholametric:scholametric@localhost:5433/scholametric";

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

const ambientDatabaseUrl = process.env.DATABASE_URL ?? LOCAL_DEFAULT_DATABASE_URL;

const TEST_DATABASE_NAME = "scholametric_test";

export const TEST_DATABASE_URL = withDatabaseName(ambientDatabaseUrl, TEST_DATABASE_NAME);

// The Postgres instance's always-present maintenance database — used only
// to issue `CREATE DATABASE scholametric_test`, which cannot target itself.
export const MAINTENANCE_DATABASE_URL = withDatabaseName(ambientDatabaseUrl, "postgres");

// global-setup.ts now drops and recreates scholametric_test on EVERY run
// (v0.9 Step 2a, docs/DECISIONS.md — the 2026-11-12 BACKLOG item: the test
// DB never resetting between runs was a confirmed, major source of flakes).
// That's a real `DROP DATABASE`, so this guard is the one thing standing
// between a config/env mistake (e.g. an ambient DATABASE_URL someone forgot
// to override) and destroying a real, non-test database. Called
// immediately before every destructive statement — never trust a caller
// to have checked first.
export function assertIsTestDatabaseUrl(databaseUrl: string): void {
  const name = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (name !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to run a destructive test-database operation against "${name}" — only "${TEST_DATABASE_NAME}" is ever allowed here.`,
    );
  }
}
