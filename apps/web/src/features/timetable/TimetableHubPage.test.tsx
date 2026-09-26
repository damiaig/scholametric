import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { TimetableHubPage } from "./TimetableHubPage";

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("TimetableHubPage", () => {
  it("renders all three destinations with the right hrefs", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return ADMIN_USER;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<TimetableHubPage />);

    expect(await screen.findByRole("link", { name: /Build timetable/ })).toHaveAttribute("href", "/timetable/build");
    expect(screen.getByRole("link", { name: /Absences & cover/ })).toHaveAttribute("href", "/timetable/absences");
    expect(screen.getByRole("link", { name: /Calendar settings/ })).toHaveAttribute("href", "/settings/calendar");
  });
});
