import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { SchoolProfilePage } from "./SchoolProfilePage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

function currentUser(role: string, school: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "admin@sunrise.test",
    firstName: "Adaobi",
    lastName: "Nwachukwu",
    role,
    status: "ACTIVE",
    lastLoginAt: null,
    school: {
      id: "s1",
      name: "Sunrise College",
      slug: "sunrise",
      type: "SECONDARY",
      status: "ACTIVE",
      address: null,
      phone: "+2348000000000",
      email: "info@sunrise.test",
      ...school,
    },
  };
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("SchoolProfilePage", () => {
  it("SCHOOL_ADMIN can edit and save the school profile", async () => {
    const user = userEvent.setup();
    let school = currentUser("SCHOOL_ADMIN").school;

    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path.includes("/auth/me")) return { ...currentUser("SCHOOL_ADMIN"), school };
      if (path === "/api/v1/schools/s1" && opts?.method === "PATCH") {
        school = { ...school, ...(opts.body as object) };
        return school;
      }
      throw new Error(`unexpected apiRequest call: ${path} ${opts?.method ?? "GET"}`);
    });

    renderWithProviders(<SchoolProfilePage />);

    const addressInput = await screen.findByLabelText("Address");
    await user.type(addressInput, "12 Freedom Way, Lekki");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockedApiRequest).toHaveBeenCalledWith(
        "/api/v1/schools/s1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.objectContaining({ address: "12 Freedom Way, Lekki" }),
        }),
      );
    });

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("shows a readable error when the save fails", async () => {
    const user = userEvent.setup();
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path.includes("/auth/me")) return currentUser("SCHOOL_ADMIN");
      if (path === "/api/v1/schools/s1" && opts?.method === "PATCH") {
        throw new Error("Network error");
      }
      throw new Error(`unexpected apiRequest call: ${path} ${opts?.method ?? "GET"}`);
    });

    renderWithProviders(<SchoolProfilePage />);

    const nameInput = await screen.findByLabelText("School name");
    await user.type(nameInput, " Updated");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("TEACHER sees the profile read-only with no save controls", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/auth/me")) return currentUser("TEACHER");
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<SchoolProfilePage />);

    const nameInput = await screen.findByLabelText("School name");
    expect(nameInput).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });
});
