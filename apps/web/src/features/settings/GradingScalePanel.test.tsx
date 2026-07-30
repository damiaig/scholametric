import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GradeBoundary, GradingPresets } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { GradingScalePanel } from "./GradingScalePanel";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

function boundary(partial: Partial<GradeBoundary> & Pick<GradeBoundary, "grade" | "minScore" | "maxScore" | "sortOrder">): GradeBoundary {
  return { id: partial.grade, schoolId: "s1", remark: "x", deletedAt: null, createdAt: "t", updatedAt: "t", ...partial };
}

const WAEC: GradeBoundary[] = [
  boundary({ grade: "A1", minScore: 75, maxScore: 100, remark: "Excellent", sortOrder: 1 }),
  boundary({ grade: "B2", minScore: 70, maxScore: 74, remark: "Very Good", sortOrder: 2 }),
  boundary({ grade: "B3", minScore: 65, maxScore: 69, remark: "Good", sortOrder: 3 }),
  boundary({ grade: "C4", minScore: 60, maxScore: 64, remark: "Credit", sortOrder: 4 }),
  boundary({ grade: "C5", minScore: 55, maxScore: 59, remark: "Credit", sortOrder: 5 }),
  boundary({ grade: "C6", minScore: 50, maxScore: 54, remark: "Credit", sortOrder: 6 }),
  boundary({ grade: "D7", minScore: 45, maxScore: 49, remark: "Pass", sortOrder: 7 }),
  boundary({ grade: "E8", minScore: 40, maxScore: 44, remark: "Pass", sortOrder: 8 }),
  boundary({ grade: "F9", minScore: 0, maxScore: 39, remark: "Fail", sortOrder: 9 }),
];

const PRESETS: GradingPresets = {
  waec9Point: WAEC.map((b) => ({ grade: b.grade, minScore: b.minScore, maxScore: b.maxScore, remark: b.remark, sortOrder: b.sortOrder })),
  simpleAToF: [
    { grade: "A", minScore: 70, maxScore: 100, remark: "Excellent", sortOrder: 1 },
    { grade: "B", minScore: 60, maxScore: 69, remark: "Very Good", sortOrder: 2 },
    { grade: "C", minScore: 50, maxScore: 59, remark: "Good", sortOrder: 3 },
    { grade: "D", minScore: 45, maxScore: 49, remark: "Pass", sortOrder: 4 },
    { grade: "F", minScore: 0, maxScore: 44, remark: "Fail", sortOrder: 5 },
  ],
};

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

function mockLoad(boundaries: GradeBoundary[] = WAEC) {
  mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
    const method = options?.method ?? "GET";
    if (path === "/api/v1/grade-boundaries" && method === "GET") return boundaries;
    if (path === "/api/v1/grading-presets" && method === "GET") return PRESETS;
    throw new Error(`unexpected apiRequest call: ${method} ${path}`);
  });
}

describe("GradingScalePanel", () => {
  it("flags a gap when a row is removed and blocks save", async () => {
    const user = userEvent.setup();
    mockLoad();

    renderWithProviders(<GradingScalePanel />);
    await screen.findByDisplayValue("A1");

    const removeButtons = screen.getAllByRole("button", { name: /^Remove/ });
    // D7 (45-49) is the 7th row (index 6).
    await user.click(removeButtons[6]);

    expect(await screen.findByText(/gap between 44 and 50/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("flags an overlap and blocks save", async () => {
    const user = userEvent.setup();
    mockLoad();

    renderWithProviders(<GradingScalePanel />);
    await screen.findByDisplayValue("A1");

    // Make D7 overlap with E8 by lowering D7's min below E8's max.
    const minInputs = screen.getAllByLabelText("Min");
    await user.clear(minInputs[6]);
    await user.type(minInputs[6], "44");

    expect(await screen.findByRole("alert")).toHaveTextContent(/overlap/);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("Apply WAEC 9-point preset fills rows and PUT is called with the right payload on save", async () => {
    const user = userEvent.setup();
    let saved = PRESETS.simpleAToF.map((r, i) => boundary({ ...r, id: `af-${i}` }));
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      if (path === "/api/v1/grade-boundaries" && method === "GET") return saved;
      if (path === "/api/v1/grading-presets" && method === "GET") return PRESETS;
      if (path === "/api/v1/grade-boundaries" && method === "PUT") {
        const body = options?.body as { boundaries: typeof PRESETS.waec9Point };
        saved = body.boundaries.map((b, i) => boundary({ ...b, id: `new-${i}` }));
        return saved;
      }
      throw new Error(`unexpected apiRequest call: ${method} ${path}`);
    });

    renderWithProviders(<GradingScalePanel />);
    await screen.findByDisplayValue("A");

    await user.click(screen.getByRole("button", { name: "Apply WAEC 9-point" }));
    await screen.findByText(/This replaces your current grading scale/);
    await user.click(screen.getByRole("button", { name: "Apply preset" }));

    expect(await screen.findByDisplayValue("A1")).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).not.toBeDisabled();
    await user.click(saveButton);

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/api/v1/grade-boundaries",
      expect.objectContaining({ method: "PUT", body: { boundaries: PRESETS.waec9Point } }),
    );
  });
});
