import { describe, it, expect } from "vitest";
import { getAgendaRange } from "./current-week-range";

describe("getAgendaRange", () => {
  it("returns today through today+6 days by default", () => {
    expect(getAgendaRange(new Date(2026, 8, 14))).toEqual({ from: "2026-09-14", to: "2026-09-20" });
  });

  it("respects a custom day count", () => {
    expect(getAgendaRange(new Date(2026, 8, 14), 1)).toEqual({ from: "2026-09-14", to: "2026-09-14" });
  });

  it("rolls over a month boundary correctly", () => {
    expect(getAgendaRange(new Date(2026, 8, 28))).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });
});
