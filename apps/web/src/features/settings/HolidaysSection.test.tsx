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

// v0.8.1 step 2 (SPEC_V0.8.1.md §2.6) — StyledDatePicker's own correctness
// (flatpickr, minDate, picking a day) is proven once in
// styled-date-picker.test.tsx. Here it's mocked down to a plain native
// input forwarding value/onChange faithfully — NOT a fixed-date stub like
// the Step 1 page tests use, since this file needs to type ARBITRARY
// dates per field (start vs end), not just jump to one canned date.
vi.mock("../../components/ui/styled-date-picker", () => ({
  StyledDatePicker: ({
    id,
    value,
    onChange,
    placeholder,
  }: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => <input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />,
}));

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

  // v0.8.1 step 2 — proves the startDate<=endDate cross-field zod refine
  // still fires now that the fields are wired through Controller instead
  // of register(): the rule lives in holidayFormSchema, independent of the
  // input mechanism, so switching to StyledDatePicker shouldn't affect it.
  it("rejects an end date before the start date, no POST sent", async () => {
    const user = userEvent.setup();
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/sessions") return SESSIONS;
      if (path === "/api/v1/calendar/holidays") return [];
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<HolidaysSection />);
    await screen.findByDisplayValue("2025/2026");

    await user.click(screen.getByRole("button", { name: /New holiday/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Backwards holiday");
    await user.type(within(dialog).getByLabelText("Starts"), "2026-10-10");
    await user.type(within(dialog).getByLabelText("Ends"), "2026-10-01");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Start date must be on or before the end date.")).toBeInTheDocument();
    expect(mockedApiRequest).not.toHaveBeenCalledWith("/api/v1/calendar/holidays", expect.objectContaining({ method: "POST" }));
  });
});
