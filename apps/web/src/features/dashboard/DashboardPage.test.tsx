import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { DashboardStats } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { DashboardPage } from "./DashboardPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const CURRENT_USER = {
  id: "u1",
  email: "admin@sunrise.test",
  firstName: "Adaobi",
  lastName: "Nwachukwu",
  role: "SCHOOL_ADMIN",
  status: "ACTIVE",
  lastLoginAt: null,
  school: {
    id: "s1",
    name: "Sunrise College",
    slug: "sunrise",
    type: "SECONDARY",
    status: "ACTIVE",
    address: null,
    phone: null,
    email: null,
  },
};

const STATS: DashboardStats = {
  totalActiveStudents: 25,
  studentsByLevel: [
    { levelName: "JSS 1", rank: 1, count: 8 },
    { levelName: "JSS 2", rank: 2, count: 10 },
    { levelName: "JSS 3", rank: 3, count: 7 },
  ],
  currentSession: "2026/2027",
  currentTerm: "FIRST",
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("DashboardPage", () => {
  it("renders stat cards and the class-level chart from mocked data", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return CURRENT_USER;
      if (path.includes("/dashboard/stats")) return STATS;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText("25")).toBeInTheDocument();
    expect(screen.getByText("2026/2027")).toBeInTheDocument();
    expect(screen.getByText("(First term)")).toBeInTheDocument();
    expect(screen.getByText("Students by class level")).toBeInTheDocument();
  });

  it("shows an error state with retry when stats fail to load", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return CURRENT_USER;
      if (path.includes("/dashboard/stats")) throw new Error("boom");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText("Couldn't load dashboard stats.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
