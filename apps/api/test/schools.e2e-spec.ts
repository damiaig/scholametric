import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";

describe("Schools search (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const search = (q: string) => request(app.getHttpServer()).get("/api/v1/schools/search").query({ q });

  it("works unauthenticated and returns Sunrise for 'sun'", async () => {
    const response = await search("sun");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Sunrise College", slug: "sunrise" })]),
    );
  });

  it("returns Hillcrest for 'hill'", async () => {
    const response = await search("hill");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Hillcrest Academy", slug: "hillcrest" })]),
    );
  });

  it("returns an empty list for a 1-character query", async () => {
    const response = await search("s");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("never includes address, phone, or email fields", async () => {
    const response = await search("sun");

    expect(response.status).toBe(200);
    for (const school of response.body) {
      expect(school).not.toHaveProperty("address");
      expect(school).not.toHaveProperty("phone");
      expect(school).not.toHaveProperty("email");
      expect(Object.keys(school).sort()).toEqual(["id", "name", "slug"]);
    }
  });
});
