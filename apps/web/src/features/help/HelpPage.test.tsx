import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { HelpPage } from "./HelpPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const BASE_USER = {
  id: "u1",
  email: "admin@sunrise.test",
  firstName: "Adaobi",
  lastName: "Nwachukwu",
  role: "SCHOOL_ADMIN",
  status: "ACTIVE",
  lastLoginAt: null,
  school: { id: "s1", name: "Sunrise College", slug: "sunrise", type: "SECONDARY", status: "ACTIVE", address: null, phone: null, email: null },
};

function mockUser(role: string) {
  mockedApiRequest.mockImplementation(async (path: string) => {
    if (path.includes("/auth/me")) return { ...BASE_USER, role };
    throw new Error(`unexpected apiRequest call: ${path}`);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

// SPEC_V0.5.1.md §2.7, v0.5.1 step 6: static, per-role content — no
// backend beyond /auth/me for the role. The critical property is
// negative, not just positive: a teacher's guide must never surface an
// admin-only power (publish/override/term close-unlock), and vice versa.
describe("HelpPage", () => {
  it("SCHOOL_ADMIN/PROPRIETOR: sees the admin guide (setup, entering, review/publish, override, mark-absent-after-publish, terms, assessment structure)", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockUser("SCHOOL_ADMIN");
    renderWithProviders(<HelpPage />);

    expect(await screen.findByText("Setting up classes & subjects")).toBeInTheDocument();
    expect(screen.getByText("Entering grades")).toBeInTheDocument();
    expect(screen.getByText("Reviewing & publishing")).toBeInTheDocument();
    expect(screen.getByText("Managing terms")).toBeInTheDocument();
    expect(screen.getByText("Assessment structure & grading scale")).toBeInTheDocument();
    expect(screen.getByText(/Override lets you set a manual grade label/)).toBeInTheDocument();
    expect(screen.getByText(/Correct a published result/)).toBeInTheDocument();

    // Never the teacher-only framing.
    expect(screen.queryByText("Your classes")).not.toBeInTheDocument();
    expect(screen.queryByText("Class remarks")).not.toBeInTheDocument();
  });

  it("PROPRIETOR sees the same admin guide as SCHOOL_ADMIN", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockUser("PROPRIETOR");
    renderWithProviders(<HelpPage />);

    expect(await screen.findByText("Setting up classes & subjects")).toBeInTheDocument();
    expect(screen.getByText("Reviewing & publishing")).toBeInTheDocument();
  });

  it("TEACHER: sees only their own guide (classes, entering grades, class remarks) — never publish/override/term-lock/assessment-structure", async () => {
    authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    mockUser("TEACHER");
    renderWithProviders(<HelpPage />);

    expect(await screen.findByText("Your classes")).toBeInTheDocument();
    expect(screen.getByText("Entering grades")).toBeInTheDocument();
    expect(screen.getByText("Class remarks")).toBeInTheDocument();

    // The critical negative assertions: no admin-only power is described.
    expect(screen.queryByText("Setting up classes & subjects")).not.toBeInTheDocument();
    expect(screen.queryByText("Reviewing & publishing")).not.toBeInTheDocument();
    expect(screen.queryByText("Managing terms")).not.toBeInTheDocument();
    expect(screen.queryByText("Assessment structure & grading scale")).not.toBeInTheDocument();
    expect(screen.queryByText(/publish/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/override/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unlock/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/relock/i)).not.toBeInTheDocument();
  });
});
