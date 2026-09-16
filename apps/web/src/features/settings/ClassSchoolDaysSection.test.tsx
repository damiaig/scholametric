import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassSchoolDays } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { apiRequest } from "../../lib/api-client";
import { ClassSchoolDaysSection } from "./ClassSchoolDaysSection";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const ROWS: ClassSchoolDays[] = [
  { classArmId: "arm1", classArmName: "A", classLevelName: "JSS 1", includesSaturday: false },
  { classArmId: "arm2", classArmName: "B", classLevelName: "JSS 2", includesSaturday: true },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ClassSchoolDaysSection", () => {
  it("lists every class arm with its Saturday checkbox reflecting includesSaturday", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/class-school-days") return ROWS;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<ClassSchoolDaysSection />);

    const jss1Checkbox = await screen.findByLabelText("JSS 1 A has school on Saturday");
    const jss2Checkbox = screen.getByLabelText("JSS 2 B has school on Saturday");
    expect(jss1Checkbox).not.toBeChecked();
    expect(jss2Checkbox).toBeChecked();
  });

  it("there is no interactive Sunday control anywhere on this page — only a Saturday checkbox per class", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/calendar/class-school-days") return ROWS;
      throw new Error(`unexpected apiRequest call: ${path}`);
    });

    renderWithProviders(<ClassSchoolDaysSection />);
    await screen.findByText("JSS 1 A");

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(ROWS.length);
    checkboxes.forEach((checkbox) => {
      expect(checkbox.getAttribute("aria-label")).toMatch(/saturday/i);
    });
  });

  it("toggling the checkbox PUTs includesSaturday with the new value", async () => {
    const user = userEvent.setup();
    mockedApiRequest.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      if (path === "/api/v1/calendar/class-school-days" && method === "GET") return ROWS;
      if (path === "/api/v1/calendar/class-school-days/arm1" && method === "PUT") {
        return { classArmId: "arm1", classArmName: "A", classLevelName: "JSS 1", ...(options?.body as object) };
      }
      throw new Error(`unexpected apiRequest call: ${method} ${path}`);
    });

    renderWithProviders(<ClassSchoolDaysSection />);
    const jss1Checkbox = await screen.findByLabelText("JSS 1 A has school on Saturday");
    await user.click(jss1Checkbox);

    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/api/v1/calendar/class-school-days/arm1",
      expect.objectContaining({ method: "PUT", body: { includesSaturday: true } }),
    );
  });
});
