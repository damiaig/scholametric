import type { ResolvedTimetableDay } from "@scholametric/shared";

export type WeekViewMode = "class" | "teacher";

// v0.8 walk-found fix — getCurrentWeekRange now requests Monday-Saturday
// (never Sunday, so there's nothing to filter for that day at all). This
// decides whether the resolved Saturday entry belongs on screen, reusing
// Step 3's existing Saturday asymmetry rather than adding new logic:
// - "class" (student/parent view): Saturday is a whole-day flag
//   (ClassSchoolDays.includesSaturday) already folded into the response —
//   a Saturday this class doesn't have resolves as nonSchoolReason
//   "WEEKEND". Known, accepted cosmetic edge: a class WITHOUT Saturday
//   whose Saturday also happens to be a holiday reports "HOLIDAY" instead
//   (holiday wins priority server-side), so that rare overlap still shows
//   a holiday-labeled Saturday column — see docs/DECISIONS.md.
// - "teacher" (cross-class view): Saturday is per-slot, never excluded at
//   the whole-day level for a teacher, so nonSchoolReason never reports
//   "WEEKEND" here — drop the column only when the teacher has no actual
//   subject that Saturday, so it isn't shown a permanently-empty column.
export function filterWeekDays(days: ResolvedTimetableDay[], mode: WeekViewMode): ResolvedTimetableDay[] {
  return days.filter((day) => {
    if (day.dayOfWeek !== "SATURDAY") {
      return true;
    }
    if (mode === "class") {
      return day.nonSchoolReason !== "WEEKEND";
    }
    return day.periods.some((period) => period.subjectName);
  });
}
