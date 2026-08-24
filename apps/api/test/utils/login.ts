import { INestApplication } from "@nestjs/common";
import request from "supertest";

// Matches prisma/seed.ts SEED_PASSWORD — seeded demo credentials, not a real secret.
export const SEED_PASSWORD = "Passw0rd!";

// v0.6 step 2: `identifier` works for staff email OR a portal username —
// parameter renamed for honesty, but every existing positional call site
// (loginAs(app, "admin@sunrise.test", "sunrise")) is unaffected.
export async function loginAs(app: INestApplication, identifier: string, schoolSlug: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ identifier, password: SEED_PASSWORD, schoolSlug });
  if (response.status !== 200) {
    throw new Error(`Login failed for ${identifier}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.accessToken as string;
}
