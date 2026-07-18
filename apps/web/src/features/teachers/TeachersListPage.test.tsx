import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useParams } from "react-router-dom";
import type { ClassLevelOverview, Paginated, PersonnelSummary } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { TeachersListPage } from "./TeachersListPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

function teacher(overrides: Partial<PersonnelSummary> = {}): PersonnelSummary {
  return {
    id: "t-1",
    schoolId: "s1",
    email: "bola@sunrise.test",
    firstName: "Bola",
    lastName: "Ogundare",
    role: "TEACHER",
    status: "ACTIVE",
    lastLoginAt: null,
    staffProfileId: "sp-1",
    staffNumber: "SUN/STF/0001",
    jobTitle: "TEACHER",
    phone: null,
    qualification: null,
    dateEmployed: null,
    ...overrides,
  };
}

const CLASSES: ClassLevelOverview[] = [
  {
    id: "lvl-1",
    name: "JSS 1",
    rank: 1,
    arms: [
      {
        id: "arm-1",
        name: "A",
        enrollmentCount: 25,
        classTeacher: { userId: "t-1", firstName: "Bola", lastName: "Ogundare" },
      },
    ],
  },
];

function DetailMarker() {
  const { id } = useParams();
  return <div>Teacher detail for {id}</div>;
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/teachers" element={<TeachersListPage />} />
      <Route path="/teachers/:id" element={<DetailMarker />} />
    </Routes>,
    { route: "/teachers" },
  );
}

function mockApi() {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/classes")) return CLASSES;
    if (path.includes("/teachers")) {
      const items = [teacher()];
      return { items, total: items.length, page: 1, pageSize: 20 } satisfies Paginated<PersonnelSummary>;
    }
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("TeachersListPage", () => {
  it("renders rows with the class-teacher-of badge computed from GET /classes", async () => {
    mockApi();
    renderWithProviders(<TeachersListPage />);

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Bola Ogundare")).toBeInTheDocument();
    expect(table.getByText("SUN/STF/0001")).toBeInTheDocument();
    expect(table.getByText("JSS 1 A")).toBeInTheDocument();
  });

  it("clicking a row navigates to the teacher's detail page", async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();

    const table = within(await screen.findByRole("table"));
    await user.click(table.getByText("Bola Ogundare"));

    expect(await screen.findByText("Teacher detail for t-1")).toBeInTheDocument();
  });
});
