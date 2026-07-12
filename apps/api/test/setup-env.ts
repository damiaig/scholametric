process.env.DATABASE_URL ??= "postgresql://scholametric:scholametric@localhost:5433/scholametric";
process.env.REDIS_URL ??= "redis://localhost:6380";
process.env.CORS_ORIGIN ??= "http://localhost:5173";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-please-do-not-use-in-prod-00";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-please-do-not-use-in-prod-0";
