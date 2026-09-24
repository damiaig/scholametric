import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/button";

interface WeekNavigationProps {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}

// v0.8 walk-found fix — a shared prev/reset/next control, reused by all
// three role pages (MyTimetable, ChildTimetable, TeacherTimetablePage) so
// wording/spacing can't drift between them. Purely presentational: the
// caller owns the weekOffset state and computes `label` via
// describeWeekOffset() (current-week-range.ts — kept out of this file so
// it stays a components-only export, per react-refresh's own lint rule).
export function WeekNavigation({ label, onPrevious, onNext, onToday }: WeekNavigationProps) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" aria-label="Previous week" onClick={onPrevious}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button type="button" variant="outline" size="sm" aria-label="Reset to today" onClick={onToday}>
        {label}
      </Button>
      <Button type="button" variant="outline" size="sm" aria-label="Next week" onClick={onNext}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
