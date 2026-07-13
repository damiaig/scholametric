import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Paginated, Student } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { GlobalSearch } from "./GlobalSearch";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const MATCH: Student = {
  id: "st-1",
  schoolId: "s1",
  admissionNumber: "SUN/2026/0001",
  firstName: "Oluwaseun",
  lastName: "Adeyemi",
  middleName: null,
  gender: "MALE",
  dateOfBirth: "2012-05-01T00:00:00.000Z",
  admittedOn: "2026-09-01T00:00:00.000Z",
  status: "ACTIVE",
  guardianName: "Guardian",
  guardianPhone: "+2348012345678",
  guardianEmail: null,
  address: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  currentEnrollment: null,
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

function renderSearch() {
  return renderWithProviders(
    <Routes>
      <Route path="/dashboard" element={<GlobalSearch />} />
      <Route path="/students/:id" element={<div>Student detail marker</div>} />
    </Routes>,
    { route: "/dashboard" },
  );
}

describe("GlobalSearch", () => {
  it("does not search below the 2-character minimum", async () => {
    const user = userEvent.setup();
    mockedApiRequest.mockImplementation(async (path: string) => {
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderSearch();
    await user.type(screen.getByRole("combobox", { name: "Search students" }), "a");

    expect(mockedApiRequest).not.toHaveBeenCalled();
  });

  it("shows matches after 2+ characters and navigates to the selected student on click", async () => {
    const user = userEvent.setup();
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/students") {
        return { items: [MATCH], total: 1, page: 1, pageSize: 8 } satisfies Paginated<Student>;
      }
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderSearch();
    await user.type(screen.getByRole("combobox", { name: "Search students" }), "Adeyemi");

    const option = await screen.findByRole("option", { name: /Oluwaseun Adeyemi/ });
    expect(option).toHaveTextContent("SUN/2026/0001");

    await user.click(option);

    expect(await screen.findByText("Student detail marker")).toBeInTheDocument();
  });
});
