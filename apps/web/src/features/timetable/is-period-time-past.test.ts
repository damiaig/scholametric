import { describe, it, expect } from "vitest";
import { isPeriodTimePast } from "@scholametric/shared";

// v0.8.1 step 3 (SPEC_V0.8.1.md §2.8) — the ONE rule shared by AbsencesPage
// (hides Replace/Edit replacement) and the API's own replace-endpoint
// guard, so it can't drift between the two.
//
// v0.9 Item B (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — SUPERSEDES this
// file's original Date.UTC-based cases. isPeriodTimePast now compares
// school-local (Africa/Lagos, WAT = UTC+1) wall-clock strings, not a UTC
// instant, so every case below is expressed as a WAT time converted to
// its UTC equivalent (WAT - 1h) rather than a UTC time treated as if it
// were local. The old millisecond-boundary case is gone — wall-clock
// comparison is minute-granular by construction, so there is no
// sub-minute boundary left to assert; it's replaced by a one-minute-after
// case instead.
describe("isPeriodTimePast — school-local (Africa/Lagos) wall-clock", () => {
  it("is false when the period ends after 'now'", () => {
    const now = new Date(Date.UTC(2026, 8, 14, 7, 0)); // 08:00 WAT
    expect(isPeriodTimePast("2026-09-14", "08:45", now)).toBe(false);
  });

  it("is true when the period ended before 'now'", () => {
    const now = new Date(Date.UTC(2026, 8, 14, 8, 0)); // 09:00 WAT
    expect(isPeriodTimePast("2026-09-14", "08:45", now)).toBe(true);
  });

  it("is true for any period on an earlier calendar date, regardless of time-of-day", () => {
    const now = new Date(Date.UTC(2026, 8, 14, 23, 1)); // 00:01 WAT, 2026-09-15
    expect(isPeriodTimePast("2026-09-14", "23:59", now)).toBe(true);
  });

  it("is false for any period on a later calendar date, regardless of time-of-day", () => {
    const now = new Date(Date.UTC(2026, 8, 14, 22, 59)); // 23:59 WAT, 2026-09-14
    expect(isPeriodTimePast("2026-09-15", "00:01", now)).toBe(false);
  });

  it("boundary: is false at the exact wall-clock minute the period ends (only strictly-after counts as past)", () => {
    const now = new Date(Date.UTC(2026, 8, 14, 7, 45)); // 08:45 WAT
    expect(isPeriodTimePast("2026-09-14", "08:45", now)).toBe(false);
  });

  it("boundary: is true one minute after the period ends", () => {
    const now = new Date(Date.UTC(2026, 8, 14, 7, 46)); // 08:46 WAT
    expect(isPeriodTimePast("2026-09-14", "08:45", now)).toBe(true);
  });
});
