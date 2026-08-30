import { TEST_DATABASE_URL } from "./test-db";

// Forced, not ??= — an ambient DATABASE_URL from the shell/CI environment
// must never leak the dev/walk database into a test run (docs/DECISIONS.md).
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.REDIS_URL ??= "redis://localhost:6380";
process.env.CORS_ORIGIN ??= "http://localhost:5173";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-please-do-not-use-in-prod-00";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-please-do-not-use-in-prod-0";
