import type { Period, ResolvedTimetableDay } from "@scholametric/shared";
import { ANY_WEEKDAY_LABELS } from "@scholametric/shared";
import { formatDate } from "../../lib/format-date";
import { describePeriodStatus } from "./period-status";

interface TimetableWeekViewProps {
  days: ResolvedTimetableDay[];
  periods: Period[];
  /** Show which class a period belongs to (the teacher's cross-class view) — omitted for a single-class view, where it would be redundant. */
  showClass?: boolean;
}

// v0.8 step 3 (SPEC_V0.8.md §7 item 3) — a clean, read-only weekly grid;
// the polished Pronote-style live agenda is Step 5. Reuses the same
// table/card visual language as Step 1's settings sections and Step 2's
// builder grid, without the click-to-assign affordances (this is a
// read-only composed view, not an editor).
export function TimetableWeekView({ days, periods, showClass = false }: TimetableWeekViewProps) {
  if (periods.length === 0) {
    return (
      <div className="rounded-lg border border-muted/20 bg-card p-10 text-center">
        <p className="text-sm text-muted">No periods have been set up yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-muted/20 bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-muted/20">
              <th className="px-4 py-3 font-medium text-muted">Period</th>
              {days.map((day) => (
                <th key={day.date} className="px-4 py-3 font-medium text-muted">
                  <div>{ANY_WEEKDAY_LABELS[day.dayOfWeek]}</div>
                  <div className="text-xs">{formatDate(day.date)}</div>
                  {!day.isSchoolDay && (
                    <div className="mt-1 text-xs font-normal text-muted">
                      {day.nonSchoolReason === "HOLIDAY" ? (day.holidayName ?? "Holiday") : "Weekend"}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.id} className="border-b border-muted/10 last:border-0">
                <td className="px-4 py-3 font-medium text-text">
                  {period.name}
                  <div className="font-mono text-xs text-muted">
                    {period.startsAt}-{period.endsAt}
                  </div>
                </td>
                {days.map((day) => {
                  const entry = day.periods.find((p) => p.periodId === period.id);
                  if (!day.isSchoolDay || !entry?.subjectName) {
                    return (
                      <td key={day.date} className="px-4 py-3 text-text">
                        <span className="text-muted">—</span>
                      </td>
                    );
                  }

                  const desc = describePeriodStatus(entry, showClass);
                  return (
                    <td key={day.date} className="px-4 py-3 text-text">
                      {desc.kind === "CANCELLED" ? (
                        <div>
                          <div className="font-medium text-danger">{desc.headline}</div>
                          <div className="text-xs text-muted line-through">{desc.subline}</div>
                        </div>
                      ) : desc.kind === "REPLACED" ? (
                        <div>
                          <div className="font-medium text-warning">{desc.headline}</div>
                          <div className="text-xs text-muted">{desc.subline}</div>
                          <div className="text-xs text-muted line-through">{desc.strikethrough}</div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium">{desc.headline}</div>
                          <div className="text-xs text-muted">{desc.subline}</div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {days.some((day) => day.isSchoolDay && day.breaks.length > 0) && (
        <p className="text-sm text-muted">
          Breaks:{" "}
          {days
            .find((day) => day.isSchoolDay)
            ?.breaks.map((brk) => `${brk.name} (${brk.startsAt}-${brk.endsAt})`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}
