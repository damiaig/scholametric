import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Break } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { apiRequest } from "../../lib/api-client";
import { BreaksSection } from "./BreaksSection";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const LUNCH: Break = { id: "b1", schoolId: "s1", name: "Lunch", startsAt: "12:00", endsAt: "12:40", createdAt: "t", updatedAt: "t" };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BreaksSection", () => {
  it("lists breaks with Starts/Ends columns", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/breaks") return [LUNCH];
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<BreaksSection />);
    expect(await screen.findByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByText("12:40")).toBeInTheDocument();
  });

  it("empty state renders when there are no breaks yet", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/breaks") return [];
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<BreaksSection />);
    expect(await screen.findByText(/No breaks yet/)).toBeInTheDocument();
  });

  it("Edit updates a break's name via PATCH", async () => {
    const user = userEvent.setup();
    let current = LUNCH;
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      if (path === "/api/v1/calendar/breaks" && method === "GET") return [current];
      if (path === "/api/v1/calendar/breaks/b1" && method === "PATCH") {
        current = { ...current, ...(options?.body as object) };
        return current;
      }
      throw new Error(`unexpected apiRequest call: ${method} ${path}`);
    });

    renderWithProviders(<BreaksSection />);
    await screen.findByText("Lunch");

    await user.click(screen.getByRole("button", { name: "Edit Lunch" }));
    const dialog = await screen.findByRole("dialog");
    const nameInput = within(dialog).getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Lunch break");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Lunch break")).toBeInTheDocument();
  });
});
