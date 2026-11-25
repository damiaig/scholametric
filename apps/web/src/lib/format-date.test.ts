import { describe, it, expect } from "vitest";
import { schoolToday } from "@scholametric/shared";
import { formatDate, formatDateTime, formatDueDateRelative } from "./format-date";

// v0.8.3 UX Round 2 Step B (SPEC_V0.8.3_ux_round2.md §Step B, Item 6).
// `today` is injected throughout — see the function's own doc comment
// for why this is a pure-function test, not a component/fake-timer one.
//
// v0.9 Item B Step B (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — every
// injected `today` below is midday UTC, nowhere near the school-local
// midnight boundary, so it unambiguously represents the same calendar
// date in every timezone this suite might run under.
describe("formatDueDateRelative", () => {
  it("is 'Today' when dueDate equals today", () => {
    expect(formatDueDateRelative("2026-09-14", new Date(Date.UTC(2026, 8, 14, 12)))).toBe("Today");
  });

  it("is 'Tomorrow' when dueDate is one day ahead", () => {
    expect(formatDueDateRelative("2026-09-15", new Date(Date.UTC(2026, 8, 14, 12)))).toBe("Tomorrow");
  });

  it("is 'Yesterday' when dueDate is one day behind", () => {
    expect(formatDueDateRelative("2026-09-13", new Date(Date.UTC(2026, 8, 14, 12)))).toBe("Yesterday");
  });

  it("falls back to the weekday-day-month format outside ±1 day", () => {
    expect(formatDueDateRelative("2026-09-17", new Date(Date.UTC(2026, 8, 14, 12)))).toBe("Thursday 17 September");
    expect(formatDueDateRelative("2026-09-10", new Date(Date.UTC(2026, 8, 14, 12)))).toBe("Thursday 10 September");
  });

  it("rolls over a month boundary correctly for Tomorrow/Yesterday", () => {
    expect(formatDueDateRelative("2026-10-01", new Date(Date.UTC(2026, 8, 30, 12)))).toBe("Tomorrow");
    expect(formatDueDateRelative("2026-09-30", new Date(Date.UTC(2026, 9, 1, 12)))).toBe("Yesterday");
  });

  it("defaults `today` to the real current date (school-local) when omitted", () => {
    expect(formatDueDateRelative(schoolToday())).toBe("Today");
  });

  // v0.9 Step B — the exact school-local midnight boundary: 23:30Z is
  // already "tomorrow" in Africa/Lagos (00:30 WAT), so a dueDate of that
  // school-local tomorrow reads as "Today" at that instant, not
  // "Tomorrow" (which a naive UTC-"today" read would have said).
  it("23:30Z (= 00:30 WAT the next day): dueDate for that school-local day is 'Today', not 'Tomorrow'", () => {
    expect(formatDueDateRelative("2026-11-13", new Date("2026-11-12T23:30:00Z"))).toBe("Today");
  });
});

// v0.9 Step B review follow-up (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) —
// formatDate's "YYYY-MM-DD"/midnight-UTC CALENDAR DATE branch never shifts
// a day regardless of process timezone; formatDateTime's real-INSTANT
// branch always resolves in SCHOOL_TIME_ZONE (Africa/Lagos), never
// browser-local.
describe("formatDate — calendar-date vs instant classification", () => {
  it("a plain 'YYYY-MM-DD' string never shifts under a negative UTC offset", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Pago_Pago"; // UTC-11
      expect(formatDate("2026-09-21")).toBe("Sep 21, 2026");
    } finally {
      process.env.TZ = original;
    }
  });

  it("a midnight-UTC ISO string (how a Prisma @db.Date field serializes) is treated identically to the plain date string", () => {
    expect(formatDate("2026-09-21T00:00:00.000Z")).toBe(formatDate("2026-09-21"));
  });

  it("is identical under TZ=UTC, Pacific/Kiritimati (UTC+14), and Pacific/Pago_Pago (UTC-11)", () => {
    const original = process.env.TZ;
    try {
      const results = ["UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago"].map((tz) => {
        process.env.TZ = tz;
        return formatDate("2026-09-21");
      });
      expect(results).toEqual(["Sep 21, 2026", "Sep 21, 2026", "Sep 21, 2026"]);
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("formatDateTime — real instants resolve in Africa/Lagos, never browser-local", () => {
  it("23:30Z (= 00:30 WAT the next day) displays the school-local date and time, not the UTC one", () => {
    expect(formatDateTime("2026-09-14T23:30:00.000Z")).toBe("Sep 15, 2026, 12:30 AM");
  });

  it("is identical regardless of the PROCESS's own timezone (TZ=UTC, Europe/Paris, Pacific/Kiritimati)", () => {
    const original = process.env.TZ;
    try {
      const results = ["UTC", "Europe/Paris", "Pacific/Kiritimati"].map((tz) => {
        process.env.TZ = tz;
        return formatDateTime("2026-09-14T23:30:00.000Z");
      });
      expect(results).toEqual(["Sep 15, 2026, 12:30 AM", "Sep 15, 2026, 12:30 AM", "Sep 15, 2026, 12:30 AM"]);
    } finally {
      process.env.TZ = original;
    }
  });
});
