import type { ResolvedPeriodEntry } from "@scholametric/shared";

// v0.8 step 5 (SPEC_V0.8.md §7 item 5) — extracted from TimetableWeekView's
// inline CANCELLED/REPLACED copy so the grid and the new agenda view can
// never drift in wording. Pure text composition only — each consumer
// still owns its own JSX/markup (a table cell vs. an agenda list row look
// nothing alike), but the STRINGS come from exactly one place.
export type PeriodStatusKind = "NORMAL" | "CANCELLED" | "REPLACED";

export interface PeriodStatusDisplay {
  kind: PeriodStatusKind;
  headline: string;
  subline: string;
  /** REPLACED only — the original subject/teacher, shown struck through. */
  strikethrough?: string;
}

// Callers are expected to only invoke this for a period that's actually
// scheduled (entry.subjectName set) on a school day — a free period or a
// non-school day is a caller-level "—"/empty state, not this function's
// concern.
export function describePeriodStatus(entry: ResolvedPeriodEntry, showClass: boolean): PeriodStatusDisplay {
  const classSuffix = showClass && entry.className ? ` · ${entry.className}` : "";

  if (entry.status === "CANCELLED") {
    return {
      kind: "CANCELLED",
      headline: "Cancelled — teacher absent",
      subline: `${entry.subjectName} · ${entry.teacherName}${classSuffix}`,
    };
  }

  if (entry.status === "REPLACED") {
    return {
      kind: "REPLACED",
      headline: entry.activityLabel ?? entry.replacementSubjectName ?? entry.subjectName ?? "",
      subline: `${entry.replacementTeacherName ?? "Covered"}${classSuffix}`,
      strikethrough: `was ${entry.subjectName} · ${entry.teacherName}`,
    };
  }

  return {
    kind: "NORMAL",
    headline: entry.subjectName ?? "",
    subline: `${entry.teacherName ?? ""}${classSuffix}`,
  };
}
