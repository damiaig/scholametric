import { ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/button";

interface WeekNavigationProps {
  label: string;
  onNext: () => void;
  onToday: () => void;
}

// v0.8 walk-found fix — a shared reset/next control, reused by all three
// role pages (MyTimetable, ChildTimetable, TeacherTimetablePage) so
// wording/spacing can't drift between them. Purely presentational: the
// caller owns the weekOffset state and computes `label` via
// describeWeekOffset() (current-week-range.ts — kept out of this file so
// it stays a components-only export, per react-refresh's own lint rule).
// Forward-only, permanently: the calendar is timetable-only (no homework),
// so the past never has anything new — there is no onPrevious prop, not a
// hidden/disabled one, so no path can ever drive weekOffset negative.
export function WeekNavigation({ label, onNext, onToday }: WeekNavigationProps) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" aria-label="Reset to today" onClick={onToday}>
        {label}
      </Button>
      <Button type="button" variant="outline" size="sm" aria-label="Next week" onClick={onNext}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
