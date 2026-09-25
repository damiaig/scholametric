import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ResolvedTimetableDay } from "@scholametric/shared";
import { Button } from "../../components/ui/button";
import { StyledDatePicker } from "../../components/ui/styled-date-picker";
import { AgendaDayCard } from "./AgendaDayCard";
import { isToday } from "./current-week-range";

interface AgendaViewProps {
  /** The single resolved day currently being viewed — the caller owns the navigated date and its query, same "page owns state, view is presentational" split as TimetableWeekView. */
  day: ResolvedTimetableDay;
  onPrevDay: () => void;
  onNextDay: () => void;
  onPickDate: (date: string) => void;
  onToday: () => void;
  showClass?: boolean;
  /** Injectable "now", same pattern as getCurrentWeekRange/AgendaDayCard — lets tests assert the Previous-disabled/Today-shortcut logic deterministically without fake timers. */
  today?: Date;
}

// v0.8.1 step 1 (SPEC_V0.8.1.md §2.1, 2.3, 2.5) — the Agenda tab is now
// day-based: one day at a time, with day-by-day navigation plus a
// date-picker to jump to any day. Replaces the old "Today + Upcoming"
// multi-day grouping entirely. Navigation floor (§2.3): "previous day" is
// disabled once already on today — the picker's own minDate="today"
// enforces the same floor inside the calendar; forward is unbounded. The
// non-school-day rendering (§2.5, holiday/weekend) is unchanged — it's
// AgendaDayCard's own existing branch, just for whichever single day is
// navigated to; nothing here skips a non-school day.
export function AgendaView({ day, onPrevDay, onNextDay, onPickDate, onToday, showClass = false, today = new Date() }: AgendaViewProps) {
  const viewingToday = isToday(day.date, today);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {!viewingToday && (
          <Button type="button" variant="outline" size="sm" onClick={onToday}>
            Today
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" aria-label="Previous day" onClick={onPrevDay} disabled={viewingToday}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <StyledDatePicker value={day.date} onChange={onPickDate} minDate="today" aria-label="Choose a date" />
        <Button type="button" variant="outline" size="sm" aria-label="Next day" onClick={onNextDay}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <AgendaDayCard day={day} showClass={showClass} today={today} />
    </div>
  );
}
