import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { StyledDatePicker } from "../../components/ui/styled-date-picker";
import type { LessonSubjectOption } from "./lesson-filters";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

interface LessonFilterBarProps {
  /**
   * Derived client-side from the loaded lessons (see
   * getLessonSubjectOptions) — no hardcoded subject list. The subject
   * control renders only when there's more than one option: a page
   * already scoped to a single subject (every teacher page, by
   * construction) or a class with lessons in only one subject has
   * nothing meaningful to filter, so it's hidden entirely rather than
   * shown as a dead "All"-only dropdown. This is a structural
   * consequence of the data, not a caller-supplied flag.
   */
  subjects: LessonSubjectOption[];
  selectedSubjectId: string;
  onSubjectChange: (subjectId: string) => void;
  /** "" = All weeks. Any "YYYY-MM-DD" narrows to that date's Monday-Sunday week. */
  weekAnchor: string;
  onWeekAnchorChange: (date: string) => void;
  onReset: () => void;
}

// v0.8.4 Lessons Read Polish (SPEC_V0.8.4_read_polish.md §2/§3/§4) —
// shared between the student/parent read view (MyLessonsPage.tsx) and
// the teacher list (LessonClassPage.tsx). Purely presentational: filtering
// itself happens in each caller over its own already-loaded lesson array
// (lesson-filters.ts) — this component only reports what was picked.
// "Show all" is always enabled, even with nothing active — a harmless
// no-op click rather than a disabled-state calculation nobody asked for.
export function LessonFilterBar({ subjects, selectedSubjectId, onSubjectChange, weekAnchor, onWeekAnchorChange, onReset }: LessonFilterBarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      {subjects.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lesson-filter-subject">Subject</Label>
          <select
            id="lesson-filter-subject"
            className={SELECT_CLASS}
            value={selectedSubjectId}
            onChange={(event) => onSubjectChange(event.target.value)}
          >
            <option value="">All</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lesson-filter-week">Week</Label>
        <StyledDatePicker id="lesson-filter-week" value={weekAnchor} onChange={onWeekAnchorChange} placeholder="All weeks" />
      </div>

      <Button type="button" variant="outline" size="sm" onClick={onReset}>
        Show all
      </Button>
    </div>
  );
}
