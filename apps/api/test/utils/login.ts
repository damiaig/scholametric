import { INestApplication } from "@nestjs/common";
import request from "supertest";

// Matches prisma/seed.ts SEED_PASSWORD — seeded demo credentials, not a real secret.
export const SEED_PASSWORD = "Passw0rd!";

export async function loginAs(app: INestApplication, email: string, schoolSlug: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, password: SEED_PASSWORD, schoolSlug });
  if (response.status !== 200) {
    throw new Error(`Login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.accessToken as string;
}
