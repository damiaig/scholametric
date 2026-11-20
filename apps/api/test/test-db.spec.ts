import { assertIsTestDatabaseUrl } from "./test-db";

describe("assertIsTestDatabaseUrl", () => {
  it("allows exactly scholametric_test", () => {
    expect(() =>
      assertIsTestDatabaseUrl("postgresql://scholametric:scholametric@localhost:5433/scholametric_test"),
    ).not.toThrow();
  });

  it("allows scholametric_test with query params (e.g. connection_limit)", () => {
    expect(() =>
      assertIsTestDatabaseUrl(
        "postgresql://scholametric:scholametric@localhost:5433/scholametric_test?connection_limit=9",
      ),
    ).not.toThrow();
  });

  it("refuses the real dev database", () => {
    expect(() =>
      assertIsTestDatabaseUrl("postgresql://scholametric:scholametric@localhost:5433/scholametric"),
    ).toThrow(/Refusing/);
  });

  it("refuses the maintenance database", () => {
    expect(() =>
      assertIsTestDatabaseUrl("postgresql://scholametric:scholametric@localhost:5433/postgres"),
    ).toThrow(/Refusing/);
  });

  it("refuses an unrelated database name even on the same host/port", () => {
    expect(() =>
      assertIsTestDatabaseUrl("postgresql://scholametric:scholametric@localhost:5433/production"),
    ).toThrow(/Refusing/);
  });
});
