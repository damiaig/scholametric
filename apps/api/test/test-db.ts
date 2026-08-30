// e2e tests must run against a DEDICATED, disposable database — never the
// same "scholametric" database the seeded dev/walk stack uses. Through
// v0.6 the e2e suite connected to that exact database (see
// docs/DECISIONS.md), which let a test silently mutate real seeded rows.
// global-setup.ts creates + migrates + seeds TEST_DATABASE_URL once before
// any test file runs; setup-env.ts forces every test file's DATABASE_URL
// here regardless of the ambient shell environment.
export const TEST_DATABASE_URL = "postgresql://scholametric:scholametric@localhost:5433/scholametric_test";

// The Postgres instance's always-present maintenance database — used only
// to issue `CREATE DATABASE scholametric_test`, which cannot target itself.
export const MAINTENANCE_DATABASE_URL = "postgresql://scholametric:scholametric@localhost:5433/postgres";
