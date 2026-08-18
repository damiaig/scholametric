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
  { id: "c1", schoolId: "s1", name: "CA 1", weight: 20, sortOrder: 1, requiresApproval: false, deletedAt: null, createdAt: "t", updatedAt: "t" },
  { id: "c2", schoolId: "s1", name: "CA 2", weight: 20, sortOrder: 2, requiresApproval: false, deletedAt: null, createdAt: "t", updatedAt: "t" },
  { id: "c3", schoolId: "s1", name: "Exam", weight: 60, sortOrder: 3, requiresApproval: true, deletedAt: null, createdAt: "t", updatedAt: "t" },
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

  // v0.5 acceptance-walk fix — the original bug: this exact edit (still
  // sums to 100, touches nothing approval-related) used to 400 on every
  // save because requiresApproval was never submitted at all. This is the
  // live case from the walk, reproduced here.
  it("a weight-only edit (still summing to 100) preserves each component's requiresApproval and saves successfully", async () => {
    const user = userEvent.setup();
    let saved: AssessmentComponent[] = SEEDED;
    let putBody: { components: { name: string; weight: number; sortOrder: number; requiresApproval: boolean }[] } | null = null;
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      if (path === "/api/v1/assessment-components" && method === "GET") return saved;
      if (path === "/api/v1/assessment-components" && method === "PUT") {
        putBody = options?.body as typeof putBody;
        saved = putBody!.components.map((c, i) => ({
          id: `new-${i}`,
          schoolId: "s1",
          name: c.name,
          weight: c.weight,
          sortOrder: c.sortOrder,
          requiresApproval: c.requiresApproval,
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

    // CA1 -1, CA2 +1 — still sums to 100, doesn't touch the approval
    // checkboxes at all.
    await user.clear(screen.getAllByLabelText("Weight")[0]);
    await user.type(screen.getAllByLabelText("Weight")[0], "19");
    await user.clear(screen.getAllByLabelText("Weight")[1]);
    await user.type(screen.getAllByLabelText("Weight")[1], "21");

    expect(await screen.findByText("Total: 100/100")).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).not.toBeDisabled();
    await user.click(saveButton);

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(putBody).toEqual({
      components: [
        { name: "CA 1", weight: 19, sortOrder: 1, requiresApproval: false },
        { name: "CA 2", weight: 21, sortOrder: 2, requiresApproval: false },
        { name: "Exam", weight: 60, sortOrder: 3, requiresApproval: true },
      ],
    });
  });

  it("allows saving at exactly 100 and calls PUT with requiresApproval included per item", async () => {
    const user = userEvent.setup();
    let saved: AssessmentComponent[] = SEEDED;
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      if (path === "/api/v1/assessment-components" && method === "GET") return saved;
      if (path === "/api/v1/assessment-components" && method === "PUT") {
        const body = options?.body as { components: { name: string; weight: number; sortOrder: number; requiresApproval: boolean }[] };
        saved = body.components.map((c, i) => ({
          id: `new-${i}`,
          schoolId: "s1",
          name: c.name,
          weight: c.weight,
          sortOrder: c.sortOrder,
          requiresApproval: c.requiresApproval,
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
            { name: "CA 1", weight: 20, sortOrder: 1, requiresApproval: false },
            { name: "CA 2", weight: 25, sortOrder: 2, requiresApproval: false },
            { name: "Exam", weight: 55, sortOrder: 3, requiresApproval: true },
          ],
        },
      }),
    );
  });

  it("toggling a component's Requires approval checkbox round-trips through save", async () => {
    const user = userEvent.setup();
    let putBody: { components: { name: string; requiresApproval: boolean }[] } | null = null;
    let saved: AssessmentComponent[] = SEEDED;
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      if (path === "/api/v1/assessment-components" && method === "GET") return saved;
      if (path === "/api/v1/assessment-components" && method === "PUT") {
        putBody = options?.body as typeof putBody;
        saved = putBody!.components.map((c, i) => ({
          id: `new-${i}`,
          schoolId: "s1",
          name: c.name,
          weight: SEEDED[i].weight,
          sortOrder: SEEDED[i].sortOrder,
          requiresApproval: c.requiresApproval,
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

    // Move approval from Exam onto CA 1 instead — still exactly one
    // approval component, so the save should still be allowed.
    const checkboxes = screen.getAllByLabelText("Requires approval");
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[2]).toBeChecked();
    await user.click(checkboxes[0]);
    await user.click(checkboxes[2]);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[2]).not.toBeChecked();

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).not.toBeDisabled();
    await user.click(saveButton);

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(putBody).toEqual({
      components: [
        { name: "CA 1", weight: 20, sortOrder: 1, requiresApproval: true },
        { name: "CA 2", weight: 20, sortOrder: 2, requiresApproval: false },
        { name: "Exam", weight: 60, sortOrder: 3, requiresApproval: false },
      ],
    });
  });

  it("unchecking every component's Requires approval blocks save client-side with the Q7 message, not a raw 400", async () => {
    const user = userEvent.setup();
    mockLoad();

    renderWithProviders(<AssessmentStructurePanel />);
    await screen.findByText("Total: 100/100");

    const checkboxes = screen.getAllByLabelText("Requires approval");
    await user.click(checkboxes[2]); // Exam was the only one checked

    expect(
      await screen.findByText("At least one component must require approval, or results can never be published."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    // Never actually round-tripped — the block is client-side, before any PUT.
    expect(mockedApiRequest).not.toHaveBeenCalledWith("/api/v1/assessment-components", expect.objectContaining({ method: "PUT" }));
  });
});
