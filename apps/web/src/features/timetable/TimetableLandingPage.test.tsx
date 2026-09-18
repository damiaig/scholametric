import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { ClassLevelOverview } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { TimetableLandingPage } from "./TimetableLandingPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const ADMIN_USER = {
  id: "u1",
  email: "admin@sunrise.test",
  firstName: "Adaobi",
  lastName: "Nwachukwu",
  role: "SCHOOL_ADMIN",
  status: "ACTIVE",
  lastLoginAt: null,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

const CLASSES: ClassLevelOverview[] = [
  { id: "lvl1", name: "JSS 1", rank: 1, arms: [{ id: "arm2", name: "A", enrollmentCount: 25, classTeacher: null }] },
  { id: "lvl2", name: "SSS 2", rank: 2, arms: [{ id: "arm1", name: "A", enrollmentCount: 30, classTeacher: null }] },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

function mockLoad(classes: ClassLevelOverview[] = CLASSES) {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return ADMIN_USER;
    if (path === "/api/v1/classes") return classes;
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

describe("TimetableLandingPage", () => {
  it("renders every class arm school-wide, grouped by level, linking to that arm's builder", async () => {
    mockLoad();

    renderWithProviders(<TimetableLandingPage />);

    expect(await screen.findByText("JSS 1")).toBeInTheDocument();
    expect(screen.getByText("SSS 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /JSS 1 A/ })).toHaveAttribute("href", "/timetable/arms/arm2");
    expect(screen.getByRole("link", { name: /SSS 2 A/ })).toHaveAttribute("href", "/timetable/arms/arm1");
    expect(screen.getByRole("link", { name: "Teacher absences" })).toHaveAttribute("href", "/timetable/absences");
  });

  it("shows the empty state when no classes exist yet", async () => {
    mockLoad([]);

    renderWithProviders(<TimetableLandingPage />);
    expect(await screen.findByText(/No classes have been set up yet/)).toBeInTheDocument();
  });

  it("shows an error state with retry when classes fail to load", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return ADMIN_USER;
      if (path === "/api/v1/classes") throw new Error("boom");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TimetableLandingPage />);
    expect(await screen.findByText("Couldn't load classes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
