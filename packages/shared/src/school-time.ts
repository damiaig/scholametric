// v0.9 Item B (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — "today" means
// school-local today, not process-local or UTC today. Product is
// Nigeria-only: ONE constant, no per-school field (approved Q1,
// docs/SPEC_V0.9.md §9) — Nigeria has a single timezone, no DST, so this
// is exact, not an approximation. Built on Intl.DateTimeFormat (no new
// dependency): Node/browsers ship IANA tzdata, so this stays correct
// across DST transitions anywhere else this code might ever run from
// (irrelevant for Lagos specifically, but means the same approach would
// still be correct if SCHOOL_TIME_ZONE ever became a real per-school
// value). The `now` parameter (always defaulted, never read internally
// without it) is what makes every caller — and every test — fully
// injectable, exactly like the three functions this module replaces.
export const SCHOOL_TIME_ZONE = "Africa/Lagos";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** The school-local (Africa/Lagos) calendar date "now" falls on, as "YYYY-MM-DD". */
export function schoolToday(now: Date = new Date()): string {
  // en-CA's own date format IS "YYYY-MM-DD" — not a locale-formatting
  // accident being relied on; it's the one broadly-supported locale whose
  // short date format matches ISO 8601 ordering exactly, which is why it's
  // the common choice for exactly this use.
  return DATE_FORMATTER.format(now);
}

export interface SchoolNowParts {
  /** "YYYY-MM-DD", school-local. */
  date: string;
  hours: number;
  minutes: number;
}

/** The school-local calendar date AND wall-clock time "now" falls on. */
export function schoolNowParts(now: Date = new Date()): SchoolNowParts {
  const parts = PARTS_FORMATTER.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hours: Number(get("hour")),
    minutes: Number(get("minute")),
  };
}
