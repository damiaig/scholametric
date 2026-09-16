import { PeriodsSection } from "./PeriodsSection";
import { BreaksSection } from "./BreaksSection";
import { HolidaysSection } from "./HolidaysSection";
import { ClassSchoolDaysSection } from "./ClassSchoolDaysSection";

// v0.8 step 1 (SPEC_V0.8.md §7 item 1) — the calendar domain's foundation
// settings surface: periods (bell schedule), breaks, holidays, per-class
// school-days. Same compositional shape as AcademicSettingsPage (a list of
// independent sections, each owning its own data fetching/mutations).
export function CalendarSettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PeriodsSection />
      <BreaksSection />
      <HolidaysSection />
      <ClassSchoolDaysSection />
    </div>
  );
}
