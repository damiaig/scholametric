import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Period } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { apiRequest } from "../../lib/api-client";
import { PeriodsSection } from "./PeriodsSection";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

function period(partial: Partial<Period> & Pick<Period, "id" | "name" | "startsAt" | "endsAt" | "sortOrder">): Period {
  return { schoolId: "s1", createdAt: "t", updatedAt: "t", ...partial };
}

const P1 = period({ id: "p1", name: "Period 1", startsAt: "08:00", endsAt: "08:45", sortOrder: 1 });
const P2 = period({ id: "p2", name: "Period 2", startsAt: "08:45", endsAt: "09:30", sortOrder: 2 });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PeriodsSection", () => {
  it("lists periods ordered as returned, with Starts/Ends columns", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/periods") return [P1, P2];
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<PeriodsSection />);

    expect(await screen.findByText("Period 1")).toBeInTheDocument();
    expect(screen.getByText("Period 2")).toBeInTheDocument();
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByText("09:30")).toBeInTheDocument();
  });

  it("empty state renders when there are no periods yet", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/periods") return [];
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<PeriodsSection />);
    expect(await screen.findByText(/No periods yet/)).toBeInTheDocument();
  });

  it("New period creates a period with the next sortOrder pre-filled", async () => {
    const user = userEvent.setup();
    let created: Period | null = null;
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      if (path === "/api/v1/calendar/periods" && method === "GET") return created ? [P1, P2, created] : [P1, P2];
      if (path === "/api/v1/calendar/periods" && method === "POST") {
        const body = options?.body as { name: string; startsAt: string; endsAt: string; sortOrder: number };
        created = period({ id: "p3", ...body });
        return created;
      }
      throw new Error(`unexpected apiRequest call: ${method} ${path}`);
    });

    renderWithProviders(<PeriodsSection />);
    await screen.findByText("Period 1");

    await user.click(screen.getByRole("button", { name: /New period/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Period 3");
    await user.type(within(dialog).getByLabelText("Starts"), "09:30");
    await user.type(within(dialog).getByLabelText("Ends"), "10:15");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Period 3")).toBeInTheDocument();
    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/api/v1/calendar/periods",
      expect.objectContaining({ method: "POST", body: expect.objectContaining({ name: "Period 3", sortOrder: 3 }) }),
    );
  });

  it("Delete removes a period after confirming", async () => {
    const user = userEvent.setup();
    let deleted = false;
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      const method = options?.method ?? "GET";
      if (path === "/api/v1/calendar/periods" && method === "GET") return deleted ? [P2] : [P1, P2];
      if (path === "/api/v1/calendar/periods/p1" && method === "DELETE") {
        deleted = true;
        return { id: "p1" };
      }
      throw new Error(`unexpected apiRequest call: ${method} ${path}`);
    });

    renderWithProviders(<PeriodsSection />);
    await screen.findByText("Period 1");

    await user.click(screen.getByRole("button", { name: "Delete Period 1" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await screen.findByText("Period 2");
    expect(screen.queryByText("Period 1")).not.toBeInTheDocument();
  });
});
