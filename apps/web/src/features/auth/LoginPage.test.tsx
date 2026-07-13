import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { ApiError, publicApiRequest } from "../../lib/api-client";
import { LoginPage } from "./LoginPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, publicApiRequest: vi.fn() };
});

const mockedPublicApiRequest = vi.mocked(publicApiRequest);

const SCHOOL_RESULTS = [{ id: "school-1", name: "Sunrise College", slug: "sunrise" }];

function mockApi() {
  mockedPublicApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/schools/search")) {
      return SCHOOL_RESULTS;
    }
    throw new Error(`unexpected publicApiRequest call: ${path}`);
  });
}

function renderLoginPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<div>Dashboard placeholder</div>} />
    </Routes>,
    { route: "/login" },
  );
}

async function selectSchool(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Select your school" }));
  await user.type(screen.getByRole("combobox", { name: "Search for your school" }), "sun");
  const option = await screen.findByRole("option", { name: /Sunrise College/ });
  await user.click(option);
}

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    authStore.clear();
  });

  it("renders school, email, and password fields", () => {
    mockApi();
    renderLoginPage();

    expect(screen.getByText("Sign in to ScholaMetric")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select your school" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("shows validation when submitting without a school", async () => {
    mockApi();
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Email"), "admin@sunrise.test");
    await user.type(screen.getByLabelText("Password"), "Passw0rd!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Please select your school")).toBeInTheDocument();
  });

  it("school picker: shows a hint below 2 characters, then results, and selecting sets the school", async () => {
    mockApi();
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Select your school" }));
    const search = screen.getByRole("combobox", { name: "Search for your school" });
    await user.type(search, "s");

    expect(await screen.findByText("Type at least 2 characters to search.")).toBeInTheDocument();

    await user.type(search, "un");
    const option = await screen.findByRole("option", { name: /Sunrise College/ });
    await user.click(option);

    expect(screen.getByRole("button", { name: "Sunrise College" })).toBeInTheDocument();
  });

  it("successful login stores tokens and navigates to /dashboard", async () => {
    mockedPublicApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/schools/search")) return SCHOOL_RESULTS;
      if (path.includes("/auth/login")) {
        return {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          user: {
            id: "u1",
            email: "admin@sunrise.test",
            firstName: "Adaobi",
            lastName: "Nwachukwu",
            role: "SCHOOL_ADMIN",
            schoolId: "s1",
            school: { id: "s1", name: "Sunrise College", slug: "sunrise" },
          },
        };
      }
      throw new Error(`unexpected publicApiRequest call: ${path}`);
    });
    const user = userEvent.setup();
    renderLoginPage();

    await selectSchool(user);
    await user.type(screen.getByLabelText("Email"), "admin@sunrise.test");
    await user.type(screen.getByLabelText("Password"), "Passw0rd!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Dashboard placeholder")).toBeInTheDocument();
    expect(authStore.getState()).toEqual({ accessToken: "access-token", refreshToken: "refresh-token" });
  });

  it("failed login shows the generic error sentence", async () => {
    mockedPublicApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/schools/search")) return SCHOOL_RESULTS;
      if (path.includes("/auth/login")) {
        throw new ApiError(401, {
          statusCode: 401,
          message: "Invalid email, password, or school.",
          error: "Unauthorized",
          path: "/api/v1/auth/login",
          timestamp: new Date().toISOString(),
        });
      }
      throw new Error(`unexpected publicApiRequest call: ${path}`);
    });
    const user = userEvent.setup();
    renderLoginPage();

    await selectSchool(user);
    await user.type(screen.getByLabelText("Email"), "admin@sunrise.test");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email, password, or school.");
    expect(authStore.getState()).toBeNull();
  });
});
