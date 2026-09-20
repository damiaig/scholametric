import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ResolvedTimetableDay } from "@scholametric/shared";
import { AgendaView } from "./AgendaView";

function makeDay(date: string, dayOfWeek: ResolvedTimetableDay["dayOfWeek"]): ResolvedTimetableDay {
  return { date, dayOfWeek, isSchoolDay: true, nonSchoolReason: null, holidayName: null, periods: [], breaks: [] };
}

afterEach(() => cleanup());

describe("AgendaView", () => {
  it("groups the first day as Today and the rest as Upcoming", () => {
    const days = [makeDay("2026-09-14", "MONDAY"), makeDay("2026-09-15", "TUESDAY"), makeDay("2026-09-16", "WEDNESDAY")];
    render(<AgendaView days={days} />);

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    // "Monday" only appears in the Today section's card header.
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Tuesday")).toBeInTheDocument();
    expect(screen.getByText("Wednesday")).toBeInTheDocument();
  });

  it("omits the Upcoming section when there's only one day", () => {
    render(<AgendaView days={[makeDay("2026-09-14", "MONDAY")]} />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.queryByText("Upcoming")).not.toBeInTheDocument();
  });

  it("shows a fallback when given no days at all", () => {
    render(<AgendaView days={[]} />);
    expect(screen.getByText("Nothing scheduled.")).toBeInTheDocument();
  });
});
