import { Coffee } from "lucide-react";
import type { ResolvedTimetableDay } from "@scholametric/shared";
import { ANY_WEEKDAY_LABELS } from "@scholametric/shared";
import { Card, CardContent } from "../../components/ui/card";
import { formatDate } from "../../lib/format-date";
import { describePeriodStatus } from "./period-status";
import { isToday } from "./current-week-range";

interface AgendaDayCardProps {
  day: ResolvedTimetableDay;
  /** Show which class a period belongs to (the teacher's cross-class agenda) — omitted for a single-class agenda, where it would be redundant. */
  showClass?: boolean;
  /** A small "Today" label instead of the weekday/date header — used on the dashboard strip, which is always genuinely today by construction. */
  compact?: boolean;
  /** Injectable "now", same pattern as getCurrentWeekRange/getAgendaRange — lets tests assert the Today/weekday header deterministically without fake timers. */
  today?: Date;
}

type AgendaRow =
  | { kind: "period"; startsAt: string; endsAt: string; periodId: string; periodName: string; subjectName: string | null }
  | { kind: "break"; startsAt: string; endsAt: string; breakId: string; name: string };

// v0.8 step 5 (SPEC_V0.8.md §7 item 5) — one day, Pronote-style: periods
// and breaks merged into a single time-ordered list (unlike the grid,
// which shows breaks as a single caption line). Reused as-is by both the
// day-based AgendaView and the dashboard's single-day strip.
// v0.8.1 step 1 (SPEC_V0.8.1.md §2.4) — the non-compact header now shows
// "Today" only when `day.date` is actually today, not unconditionally the
// weekday name; a navigated day shows its real weekday (the date itself
// was already shown separately below it either way — no layout change).
export function AgendaDayCard({ day, showClass = false, compact = false, today = new Date() }: AgendaDayCardProps) {
  const rows: AgendaRow[] = [
    ...day.periods.map((entry) => ({
      kind: "period" as const,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      periodId: entry.periodId,
      periodName: entry.periodName,
      subjectName: entry.subjectName,
    })),
    ...day.breaks.map((brk) => ({ kind: "break" as const, startsAt: brk.startsAt, endsAt: brk.endsAt, breakId: brk.breakId, name: brk.name })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-semibold text-text">{compact || isToday(day.date, today) ? "Today" : ANY_WEEKDAY_LABELS[day.dayOfWeek]}</h3>
          <span className="text-xs text-muted">{formatDate(day.date)}</span>
        </div>

        {!day.isSchoolDay ? (
          <p className="text-sm text-muted">No school — {day.nonSchoolReason === "HOLIDAY" ? (day.holidayName ?? "Holiday") : "Weekend"}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">Nothing scheduled.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) =>
              row.kind === "break" ? (
                <li key={`break-${row.breakId}`} className="flex items-center gap-3 rounded-md bg-muted/5 px-3 py-2 text-sm text-muted">
                  <Coffee className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="font-mono text-xs">
                    {row.startsAt}-{row.endsAt}
                  </span>
                  <span>{row.name}</span>
                </li>
              ) : (
                <AgendaPeriodRow key={row.periodId} row={row} day={day} showClass={showClass} />
              ),
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AgendaPeriodRow({ row, day, showClass }: { row: Extract<AgendaRow, { kind: "period" }>; day: ResolvedTimetableDay; showClass: boolean }) {
  const entry = day.periods.find((p) => p.periodId === row.periodId)!;
  const timeRange = (
    <span className="font-mono text-xs text-muted">
      {row.startsAt}-{row.endsAt}
    </span>
  );

  if (!entry.subjectName) {
    return (
      <li className="flex items-center gap-3 rounded-md border border-muted/10 px-3 py-2">
        {timeRange}
        <span className="text-sm text-muted">Free period</span>
      </li>
    );
  }

  const desc = describePeriodStatus(entry, showClass);
  return (
    <li className="flex items-start gap-3 rounded-md border border-muted/10 px-3 py-2">
      {timeRange}
      <div className="min-w-0">
        <p className={`font-medium ${desc.kind === "CANCELLED" ? "text-danger" : desc.kind === "REPLACED" ? "text-warning" : "text-text"}`}>
          {desc.headline}
        </p>
        <p className={`text-xs text-muted ${desc.kind === "CANCELLED" ? "line-through" : ""}`}>{desc.subline}</p>
        {desc.strikethrough && <p className="text-xs text-muted line-through">{desc.strikethrough}</p>}
      </div>
    </li>
  );
}
