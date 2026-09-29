import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { MyTeaching } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { HomeworkLandingPage } from "./HomeworkLandingPage";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const TEACHING: MyTeaching = {
  classTeacherOf: [],
  subjects: [{ id: "sa1", subjectId: "sub1", subjectName: "Mathematics", classArmId: "arm1", className: "JSS 1 A" }],
  currentSessionId: "sess1",
  currentTermId: "term1",
  currentTermName: "FIRST",
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("HomeworkLandingPage", () => {
  it("lists subjects taught, each linking to the class+subject scoped homework page", async () => {
    mockedApiRequest.mockResolvedValue(TEACHING);
    renderWithProviders(<HomeworkLandingPage />);

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("JSS 1 A")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/homework/arms/arm1?subjectId=sub1");
  });

  it("shows an empty state with no subject assignments", async () => {
    mockedApiRequest.mockResolvedValue({ ...TEACHING, subjects: [] });
    renderWithProviders(<HomeworkLandingPage />);

    expect(await screen.findByText("You have no subject assignments yet — your school admin assigns these.")).toBeInTheDocument();
  });

  it("shows an error state with a retry action", async () => {
    mockedApiRequest.mockRejectedValue(new Error("network down"));
    renderWithProviders(<HomeworkLandingPage />);

    expect(await screen.findByText("Couldn't load your teaching load.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
