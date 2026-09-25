import { useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { Tabs } from "../../components/ui/tabs";
import { getErrorMessage } from "../../lib/api-client";
import { useTeachingTimetable } from "./use-timetable-views";
import { getCurrentWeekRange, addWeeks, describeWeekOffset, todayDateString, addDaysToDateString } from "./current-week-range";
import { TimetableWeekView } from "./TimetableWeekView";
import { AgendaView } from "./AgendaView";
import { deriveWeekPeriods } from "./derive-week-periods";
import { filterWeekDays } from "./filter-week-days";
import { WeekNavigation } from "./WeekNavigation";
import { AbsenceMarkingDialog } from "./AbsenceMarkingDialog";

const VIEW_TABS = [
  { value: "agenda", label: "Agenda" },
  { value: "week", label: "Full week" },
];

// v0.8 step 3 (SPEC_V0.8.md §7 item 3) — a TEACHER's own resolved
// schedule, across every class they teach. v0.8 step 4 adds the
// absence-marking control.
// Walk-found fix: NO GET /calendar/periods call — that route is
// SCHOOL_ADMIN/PROPRIETOR-only and stays that way; the week grid's period
// rows are derived from this response instead (deriveWeekPeriods).
// v0.8.1 step 1 (SPEC_V0.8.1.md §2.1) — the Agenda tab is now day-based:
// its own independent `agendaDate` state (a "YYYY-MM-DD" string), decoupled
// from Full-week's weekOffset (a day and a week-offset aren't the same
// unit once a date-picker can jump to any day). Consequential fix: "Mark
// absent" used to source its date options from the agenda's rolling
// window (agendaTimetable) — now that's a single day, so it sources from
// weekTimetable instead, which still fetches unconditionally regardless of
// active tab and offers a full Mon-Fri/Sat window (an improvement over the
// old rolling source, not a narrowing).
export function TeacherTimetablePage() {
  const [tab, setTab] = useState("agenda");
  const [weekOffset, setWeekOffset] = useState(0);
  const [agendaDate, setAgendaDate] = useState(() => todayDateString());
  const weekRange = useMemo(() => getCurrentWeekRange(addWeeks(new Date(), weekOffset)), [weekOffset]);
  const weekTimetable = useTeachingTimetable(weekRange);
  const agendaTimetable = useTeachingTimetable({ from: agendaDate, to: agendaDate });
  const [isAbsenceDialogOpen, setAbsenceDialogOpen] = useState(false);

  const active = tab === "week" ? weekTimetable : agendaTimetable;
  const isLoading = active.isLoading;
  const isError = active.isError;
  const defaultLabel = tab === "week" ? "This week" : "Agenda";

  return (
    <div>
      <PageHeader
        title="My Timetable"
        description={defaultLabel}
        actions={
          weekTimetable.data && (
            <Button type="button" onClick={() => setAbsenceDialogOpen(true)}>
              Mark absent
            </Button>
          )
        }
      />

      {tab === "week" && (
        <WeekNavigation
          label={describeWeekOffset(weekOffset, "This week", weekTimetable.data)}
          onNext={() => setWeekOffset((offset) => offset + 1)}
          onToday={() => setWeekOffset(0)}
        />
      )}

      {weekTimetable.data && (
        <AbsenceMarkingDialog open={isAbsenceDialogOpen} onClose={() => setAbsenceDialogOpen(false)} days={weekTimetable.data.days} />
      )}

      <Tabs value={tab} onValueChange={setTab} items={VIEW_TABS} aria-label="Timetable view">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Loading your timetable…
          </p>
        )}

        {isError && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm text-danger">{getErrorMessage(active.error, "Couldn't load your timetable.")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => active.refetch()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && active.data && (
          tab === "week" ? (
            <TimetableWeekView
              days={filterWeekDays(active.data.days, "teacher")}
              periods={deriveWeekPeriods(filterWeekDays(active.data.days, "teacher"))}
              showClass
            />
          ) : (
            <AgendaView
              day={active.data.days[0]}
              onPrevDay={() => setAgendaDate((date) => addDaysToDateString(date, -1))}
              onNextDay={() => setAgendaDate((date) => addDaysToDateString(date, 1))}
              onPickDate={setAgendaDate}
              onToday={() => setAgendaDate(todayDateString())}
              showClass
            />
          )
        )}
      </Tabs>
    </div>
  );
}
