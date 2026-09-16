import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicSession, Holiday } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { apiRequest } from "../../lib/api-client";
import { HolidaysSection } from "./HolidaysSection";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

function session(partial: Partial<AcademicSession> & Pick<AcademicSession, "id" | "name" | "isCurrent">): AcademicSession {
  return { schoolId: "s1", startsOn: "2026-09-01", endsOn: "2027-07-31", createdAt: "t", updatedAt: "t", ...partial };
}

const SESSIONS = { items: [session({ id: "sess1", name: "2025/2026", isCurrent: true })], total: 1, page: 1, pageSize: 100 };

const CHRISTMAS: Holiday = {
  id: "h1",
  schoolId: "s1",
  sessionId: "sess1",
  termId: null,
  name: "Christmas break",
  startDate: "2026-12-20",
  endDate: "2027-01-08",
  createdAt: "t",
  updatedAt: "t",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HolidaysSection", () => {
  it("auto-selects the current session and lists its holidays", async () => {
    mockedApiRequest.mockImplementation(async (path: string, options?: { query?: Record<string, unknown> }) => {
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/calendar/holidays" && options?.query?.sessionId === "sess1") return [CHRISTMAS];
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<HolidaysSection />);

    expect(await screen.findByText("Christmas break")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2025/2026")).toBeInTheDocument();
  });

  it("empty state renders when the session has no holidays yet", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/calendar/holidays") return [];
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<HolidaysSection />);
    expect(await screen.findByText(/No holidays yet/)).toBeInTheDocument();
  });

  it("New holiday creates one scoped to the selected session, with sessionId in the payload", async () => {
    const user = userEvent.setup();
    let created: Holiday | null = null;
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown; query?: Record<string, unknown> }) => {
      const method = options?.method ?? "GET";
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/calendar/holidays" && method === "GET") return created ? [created] : [];
      if (path === "/api/v1/calendar/holidays" && method === "POST") {
        const body = options?.body as { sessionId: string; name: string; startDate: string; endDate: string };
        created = { id: "h2", schoolId: "s1", termId: null, createdAt: "t", updatedAt: "t", ...body };
        return created;
      }
      throw new Error(`unexpected apiRequest call: ${method} ${path}`);
    });

    renderWithProviders(<HolidaysSection />);
    await screen.findByDisplayValue("2025/2026");

    await user.click(screen.getByRole("button", { name: /New holiday/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Public holiday");
    await user.type(within(dialog).getByLabelText("Starts"), "2026-10-01");
    await user.type(within(dialog).getByLabelText("Ends"), "2026-10-01");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Public holiday")).toBeInTheDocument();
    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/api/v1/calendar/holidays",
      expect.objectContaining({ method: "POST", body: expect.objectContaining({ sessionId: "sess1", name: "Public holiday" }) }),
    );
  });
});
