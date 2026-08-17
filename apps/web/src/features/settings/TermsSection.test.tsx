import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicSession, CloseTermResponse, Paginated, Term } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { TermsSection } from "./TermsSection";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

function paginated<T>(items: T[]): Paginated<T> {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

const SESSION: AcademicSession = {
  id: "sess1",
  schoolId: "s1",
  name: "2026/2027",
  startsOn: "2026-09-01",
  endsOn: "2027-07-31",
  isCurrent: true,
  createdAt: "t",
  updatedAt: "t",
};

const OPEN_TERM: Term = {
  id: "term1",
  schoolId: "s1",
  sessionId: "sess1",
  name: "FIRST",
  startsOn: "2026-09-01",
  endsOn: "2026-12-12",
  isCurrent: true,
  closedAt: null,
  closedBy: null,
  createdAt: "t",
  updatedAt: "t",
};

const CLOSED_TERM: Term = { ...OPEN_TERM, id: "term2", name: "SECOND", isCurrent: false, closedAt: "2027-01-20T09:00:00Z", closedBy: "u1" };

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

// SPEC_V0.5.md §2.3/Q4, v0.5 step 5 — the Close action lives alongside the
// existing per-term Activate action on the same table row.
describe("TermsSection — close term", () => {
  it("closes a term, showing the warn-but-allow unpublished summary from the response (not a separate preview)", async () => {
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/terms" && method !== "POST") return paginated([OPEN_TERM]);
      if (path === "/api/v1/terms/term1/close" && method === "POST") {
        const result: CloseTermResponse = {
          ...OPEN_TERM,
          closedAt: "2027-01-20T09:00:00Z",
          closedBy: "u1",
          unpublishedCount: 3,
          unpublished: [{ classArmId: "arm1", subjectId: "sub1", draftCount: 1, pendingApprovalCount: 2 }],
        };
        return result;
      }
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<TermsSection session={SESSION} />);

    const table = await screen.findByRole("table");
    const row = within(table).getByText("First term").closest("tr");
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Close" }));

    const confirmDialog = await screen.findByRole("dialog", { name: "Close term" });
    expect(within(confirmDialog).getByText(/read-only for teachers/)).toBeInTheDocument();
    await user.click(within(confirmDialog).getByRole("button", { name: "Close term" }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Term closed" })).toBeInTheDocument());
    const resultDialog = screen.getByRole("dialog", { name: "Term closed" });
    expect(within(resultDialog).getByText(/3 results across 1 class\/subject pair/)).toBeInTheDocument();

    await user.click(within(resultDialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("everything already published: the result view says so, not a blank/zero breakdown", async () => {
    mockedApiRequest.mockImplementation(async (path, options) => {
      const method = (options as { method?: string })?.method;
      if (path === "/api/v1/terms" && method !== "POST") return paginated([OPEN_TERM]);
      if (path === "/api/v1/terms/term1/close" && method === "POST") {
        const result: CloseTermResponse = { ...OPEN_TERM, closedAt: "t2", closedBy: "u1", unpublishedCount: 0, unpublished: [] };
        return result;
      }
      throw new Error(`unexpected call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<TermsSection session={SESSION} />);

    const table = await screen.findByRole("table");
    const row = within(table).getByText("First term").closest("tr");
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Close" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Close term" });
    await user.click(within(confirmDialog).getByRole("button", { name: "Close term" }));

    await waitFor(() => expect(screen.getByText(/Everything was already published/)).toBeInTheDocument());
  });

  it("an already-closed term shows a Closed badge and no Close action", async () => {
    mockedApiRequest.mockImplementation(async (path, options) => {
      if (path === "/api/v1/terms" && (options as { method?: string })?.method !== "POST") return paginated([CLOSED_TERM]);
      throw new Error(`unexpected call: ${path}`);
    });
    renderWithProviders(<TermsSection session={SESSION} />);

    const table = await screen.findByRole("table");
    const row = within(table).getByText("Second term").closest("tr") as HTMLElement;
    expect(within(row).getByText("Closed")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});
