// v0.8.4 Lessons Read Polish (SPEC_V0.8.4_read_polish.md §2/§3) — pure,
// injectable filter helpers over the already-loaded, already-bounded
// per-class-per-session lesson array. No backend contact: every filter
// here operates purely on data the caller already has in hand. Mirrors
// filter-week-days.ts's own single-purpose-pure-function style.

export interface LessonSubjectOption {
  id: string;
  name: string;
}

// Only ever called from the student/parent side (MyLessonsPage.tsx) —
// the teacher page (LessonClassPage.tsx) is already scoped to exactly
// one subject by construction (reached from one class+subject cell on
// the landing table), and its Lesson type doesn't even carry
// subjectName. Preserves first-seen order from the loaded list (no
// sort requirement in the spec).
export function getLessonSubjectOptions<T extends { subjectId: string; subjectName: string }>(lessons: T[]): LessonSubjectOption[] {
  const seen = new Map<string, string>();
  for (const lesson of lessons) {
    if (!seen.has(lesson.subjectId)) {
      seen.set(lesson.subjectId, lesson.subjectName);
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

export function filterBySubjectId<T extends { subjectId: string }>(lessons: T[], subjectId: string): T[] {
  if (!subjectId) {
    return lessons;
  }
  return lessons.filter((lesson) => lesson.subjectId === subjectId);
}

// Monday-anchored week containing `anchor` ("YYYY-MM-DD"), as
// ["YYYY-MM-DD", "YYYY-MM-DD"] (Monday, Sunday) — the same Monday-offset
// arithmetic as features/timetable/current-week-range.ts's
// getCurrentWeekRange (`day === 0 ? -6 : 1 - day`), reimplemented locally
// rather than imported: 3 lines of date math, and importing across
// feature domains isn't a coupling this codebase otherwise has (same
// duplicate-don't-cross-couple discipline already applied between
// homework/ and lessons/). Unlike getCurrentWeekRange (Monday-Saturday,
// a timetable-grid concern with no Sunday column), this is a true
// Monday-Sunday boundary — a lessonDate can never actually fall on a
// Sunday (isSchoolDayForClassOnDate rejects it categorically), but the
// boundary itself should be correct regardless of that domain fact.
function weekBounds(anchor: string): [string, string] {
  const [year, month, day] = anchor.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay(); // 0 = Sunday
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [formatDate(monday), formatDate(sunday)];
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// weekAnchor is the date the caller PICKED (any day in the desired week),
// not the week's own Monday — `lessonDate` strings compare correctly as
// plain strings (YYYY-MM-DD sorts lexicographically the same as
// chronologically), so no Date-object comparison is needed for the
// filter itself, only for computing the Monday/Sunday bounds above.
export function filterByWeek<T extends { lessonDate: string }>(lessons: T[], weekAnchor: string): T[] {
  if (!weekAnchor) {
    return lessons;
  }
  const [start, end] = weekBounds(weekAnchor);
  return lessons.filter((lesson) => lesson.lessonDate >= start && lesson.lessonDate <= end);
}
