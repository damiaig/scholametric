import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssessmentComponent, GradesGridResponse } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest, ApiError } from "../../lib/api-client";
import { MarkAbsentDialog } from "./MarkAbsentDialog";
import type { MarkAbsentTarget } from "./ClassArmResultsView";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const TARGET: MarkAbsentTarget = {
  studentId: "st1",
  studentName: "Chidi Okoro",
  subjectId: "sub1",
  subjectName: "Mathematics",
  classArmId: "arm1",
  termId: "term1",
};

const COMPONENTS: AssessmentComponent[] = [
  { id: "c1", schoolId: "s1", name: "CA 1", weight: 20, sortOrder: 1, requiresApproval: false, deletedAt: null, createdAt: "t", updatedAt: "t" },
  { id: "exam", schoolId: "s1", name: "Exam", weight: 60, sortOrder: 2, requiresApproval: true, deletedAt: null, createdAt: "t", updatedAt: "t" },
];

function gridResponse(overrides: Partial<GradesGridResponse["rows"][number]>): GradesGridResponse {
  return {
    classArmId: "arm1",
    subjectId: "sub1",
    componentId: "exam",
    termId: "term1",
    maxScore: 100,
    requiresApproval: true,
    termClosed: false,
    locked: false,
    unlockReason: null,
    rows: [
      { studentId: "st1", firstName: "Chidi", lastName: "Okoro", admissionNumber: "SUN/0001", rawScore: 100, isAbsent: false, status: "PUBLISHED", ...overrides },
    ],
  };
}

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

// The component select starts disabled (useAssessmentComponents() hasn't
// resolved on first render) — waiting for it to enable before selecting
// avoids a race against the mocked query settling.
async function selectComponent(user: ReturnType<typeof userEvent.setup>, value: string) {
  const select = (await screen.findByLabelText("Component")) as HTMLSelectElement;
  await waitFor(() => expect(select).not.toBeDisabled());
  await user.selectOptions(select, value);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("MarkAbsentDialog", () => {
  it("renders nothing when target is null", () => {
    mockedApiRequest.mockImplementation(async () => {
      throw new Error("should not be called");
    });
    renderWithProviders(<MarkAbsentDialog target={null} onClose={vi.fn()} />);
    expect(screen.queryByText("Correct a published result")).not.toBeInTheDocument();
  });

  it("picking a component loads and prefills the student's current value", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/assessment-components") return COMPONENTS;
      if (path === "/api/v1/grades/grid") return gridResponse({ rawScore: 100, isAbsent: false });
      throw new Error(`unexpected call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={vi.fn()} />);

    expect(await screen.findByText(/Chidi Okoro — Mathematics/)).toBeInTheDocument();
    await selectComponent(user, "exam");

    const scoreInput = (await screen.findByLabelText(/Score \(out of 100\)/)) as HTMLInputElement;
    await waitFor(() => expect(scoreInput.value).toBe("100"));
    expect((screen.getByLabelText("Mark absent") as HTMLInputElement).checked).toBe(false);
  });

  it("prefills as absent (checkbox checked, score field disabled) when the current row is already absent", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/assessment-components") return COMPONENTS;
      if (path === "/api/v1/grades/grid") return gridResponse({ rawScore: null, isAbsent: true });
      throw new Error(`unexpected call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={vi.fn()} />);
    await selectComponent(user, "exam");

    const checkbox = (await screen.findByLabelText("Mark absent")) as HTMLInputElement;
    await waitFor(() => expect(checkbox.checked).toBe(true));
    expect(screen.getByLabelText(/Score \(out of 100\)/)).toBeDisabled();
  });

  it("submitting a mark-absent correction calls PUT /grades/grid with rawScore: null, isAbsent: true, and closes on success", async () => {
    const onClose = vi.fn();
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/assessment-components") return COMPONENTS;
      if (path === "/api/v1/grades/grid" && (!opts?.method || opts.method === "GET")) return gridResponse({ rawScore: 100, isAbsent: false });
      if (path === "/api/v1/grades/grid" && opts?.method === "PUT") {
        expect(opts.body).toEqual({
          classArmId: "arm1",
          subjectId: "sub1",
          componentId: "exam",
          termId: "term1",
          scores: [{ studentId: "st1", rawScore: null, isAbsent: true }],
        });
        return gridResponse({ rawScore: null, isAbsent: true });
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={onClose} />);
    await selectComponent(user, "exam");
    await screen.findByDisplayValue("100");

    await user.click(screen.getByLabelText("Mark absent"));
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("submitting a score correction (un-absent) sends the real rawScore with isAbsent: false", async () => {
    const onClose = vi.fn();
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/assessment-components") return COMPONENTS;
      if (path === "/api/v1/grades/grid" && (!opts?.method || opts.method === "GET")) return gridResponse({ rawScore: null, isAbsent: true });
      if (path === "/api/v1/grades/grid" && opts?.method === "PUT") {
        expect(opts.body).toEqual({
          classArmId: "arm1",
          subjectId: "sub1",
          componentId: "exam",
          termId: "term1",
          scores: [{ studentId: "st1", rawScore: 85, isAbsent: false }],
        });
        return gridResponse({ rawScore: 85, isAbsent: false });
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={onClose} />);
    await selectComponent(user, "exam");
    await waitFor(() => expect((screen.getByLabelText("Mark absent") as HTMLInputElement).checked).toBe(true));

    await user.click(screen.getByLabelText("Mark absent")); // uncheck
    const scoreInput = screen.getByLabelText(/Score \(out of 100\)/);
    await user.clear(scoreInput);
    await user.type(scoreInput, "85");

    await user.click(screen.getByRole("button", { name: "Save correction" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("a rejected correction (e.g. closed term) shows the backend's message, not a silent failure", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === "/api/v1/assessment-components") return COMPONENTS;
      if (path === "/api/v1/grades/grid" && (!opts?.method || opts.method === "GET")) return gridResponse({ rawScore: 100, isAbsent: false });
      if (path === "/api/v1/grades/grid" && opts?.method === "PUT") {
        throw new ApiError(409, {
          statusCode: 409,
          message: "This term is closed. Ask your principal/proprietor to unlock this class and subject before editing.",
          error: "Conflict",
          path: "/api/v1/grades/grid",
          timestamp: new Date().toISOString(),
        });
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={vi.fn()} />);
    await selectComponent(user, "exam");
    await screen.findByDisplayValue("100");

    await user.click(screen.getByLabelText("Mark absent"));
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    expect(await screen.findByText(/This term is closed/)).toBeInTheDocument();
  });

  it("Save correction is disabled until a component is chosen", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/assessment-components") return COMPONENTS;
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<MarkAbsentDialog target={TARGET} onClose={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Save correction" })).toBeDisabled();
  });
});
