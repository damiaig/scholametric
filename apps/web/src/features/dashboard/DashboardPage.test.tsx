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

  it("Y-axis ticks are distinct integers, not repeated/rounded to the same value", async () => {
    // Shaped like the real data that triggered the bug this guards: one
    // large level (104) among several small ones, producing multi-digit
    // tick values (0, 50, 100, 150 — computed by chart-ticks.ts, see
    // chart-ticks.test.ts for the pure tick-math tests). The real bug was
    // visual, not data: a negative chart margin pushed wide tick labels
    // outside the SVG's clipped viewBox, so only their last digit —
    // always "0" for round numbers — stayed visible (confirmed via live
    // Playwright screenshots against the real stack; jsdom has no real
    // SVG layout/overflow clipping, so it can't reproduce that part —
    // see docs/DECISIONS.md). What this test checks is that the DOM
    // actually contains every distinct tick value, i.e. recharts isn't
    // silently dropping/collapsing any of them.
    //
    // recharts' ResponsiveContainer needs a real non-zero container size
    // to render its children at all (jsdom's ResizeObserver stub in
    // test/setup.ts never fires, and elements default to 0x0) — stub one
    // just for this test.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 500,
      height: 256,
      top: 0,
      left: 0,
      bottom: 256,
      right: 500,
      x: 0,
      y: 0,
      toJSON() {},
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(256);
    const RealResizeObserver = globalThis.ResizeObserver;
    class FiringResizeObserverStub {
      #callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
      }
      observe(target: Element) {
        this.#callback([{ target, contentRect: { width: 500, height: 256 } } as ResizeObserverEntry], this);
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = FiringResizeObserverStub as unknown as typeof ResizeObserver;

    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return CURRENT_USER;
      if (path.includes("/dashboard/stats")) {
        return {
          ...STATS,
          totalActiveStudents: 126,
          studentsByLevel: [
            { levelName: "JSS 1", rank: 1, count: 6 },
            { levelName: "JSS 2", rank: 2, count: 104 },
            { levelName: "JSS 3", rank: 3, count: 4 },
          ],
        };
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<DashboardPage />);

    await screen.findByText("Students by class level");
    const tickTexts = document.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick-value");
    const values = Array.from(tickTexts).map((el) => el.textContent);
    globalThis.ResizeObserver = RealResizeObserver;

    expect(values).toEqual(["0", "50", "100", "150"]);
    expect(new Set(values).size).toBe(values.length);
  });

  it("shows the empty-session banner when the current session has zero enrollments", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return CURRENT_USER;
      if (path.includes("/dashboard/stats")) {
        return { ...STATS, totalActiveStudents: 0, studentsByLevel: [], currentSession: "2027/2028" };
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<DashboardPage />);

    expect(
      await screen.findByText(/No students are enrolled in the current session \(2027\/2028\)/),
    ).toBeInTheDocument();
  });
});
