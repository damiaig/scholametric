import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssessmentComponent } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { AssessmentStructurePanel } from "./AssessmentStructurePanel";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const SEEDED: AssessmentComponent[] = [
  { id: "c1", schoolId: "s1", name: "CA 1", weight: 20, sortOrder: 1, deletedAt: null, createdAt: "t", updatedAt: "t" },
  { id: "c2", schoolId: "s1", name: "CA 2", weight: 20, sortOrder: 2, deletedAt: null, createdAt: "t", updatedAt: "t" },
  { id: "c3", schoolId: "s1", name: "Exam", weight: 60, sortOrder: 3, deletedAt: null, createdAt: "t", updatedAt: "t" },
];

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

function mockLoad(components: AssessmentComponent[] = SEEDED) {
  mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
    const method = options?.method ?? "GET";
    if (path === "/api/v1/assessment-components" && method === "GET") return components;
    throw new Error(`unexpected apiRequest call: ${method} ${path}`);
  });
}

describe("AssessmentStructurePanel", () => {
  it("shows the live total and blocks save when the weight is changed off 100", async () => {
    const user = userEvent.setup();
    mockLoad();

    renderWithProviders(<AssessmentStructurePanel />);

    expect(await screen.findByText("Total: 100/100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await user.clear(screen.getAllByLabelText("Weight")[2]);
    await user.type(screen.getAllByLabelText("Weight")[2], "50");

    expect(await screen.findByText("Total: 90/100")).toBeInTheDocument();
    expect(screen.getByText(/currently 90/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("allows saving at exactly 100 and calls PUT with the correct payload", async () => {
    const user = userEvent.setup();
    let saved: AssessmentComponent[] = SEEDED;
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      if (path === "/api/v1/assessment-components" && method === "GET") return saved;
      if (path === "/api/v1/assessment-components" && method === "PUT") {
        const body = options?.body as { components: { name: string; weight: number; sortOrder: number }[] };
        saved = body.components.map((c, i) => ({
          id: `new-${i}`,
          schoolId: "s1",
          name: c.name,
          weight: c.weight,
          sortOrder: c.sortOrder,
          deletedAt: null,
          createdAt: "t",
          updatedAt: "t",
        }));
        return saved;
      }
      throw new Error(`unexpected apiRequest call: ${method} ${path}`);
    });

    renderWithProviders(<AssessmentStructurePanel />);
    await screen.findByText("Total: 100/100");

    await user.clear(screen.getAllByLabelText("Weight")[1]);
    await user.type(screen.getAllByLabelText("Weight")[1], "25");
    await user.clear(screen.getAllByLabelText("Weight")[2]);
    await user.type(screen.getAllByLabelText("Weight")[2], "55");

    expect(await screen.findByText("Total: 100/100")).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).not.toBeDisabled();
    await user.click(saveButton);

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/api/v1/assessment-components",
      expect.objectContaining({
        method: "PUT",
        body: {
          components: [
            { name: "CA 1", weight: 20, sortOrder: 1 },
            { name: "CA 2", weight: 25, sortOrder: 2 },
            { name: "Exam", weight: 55, sortOrder: 3 },
          ],
        },
      }),
    );
  });
});
