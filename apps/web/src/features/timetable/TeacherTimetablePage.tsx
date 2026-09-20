import { useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { Tabs } from "../../components/ui/tabs";
import { getErrorMessage } from "../../lib/api-client";
import { useTeachingTimetable } from "./use-timetable-views";
import { getCurrentWeekRange, getAgendaRange } from "./current-week-range";
import { TimetableWeekView } from "./TimetableWeekView";
import { AgendaView } from "./AgendaView";
import { deriveWeekPeriods } from "./derive-week-periods";
import { AbsenceMarkingDialog } from "./AbsenceMarkingDialog";

const VIEW_TABS = [
  { value: "agenda", label: "Agenda" },
  { value: "week", label: "Full week" },
];

// v0.8 step 3 (SPEC_V0.8.md §7 item 3) — a TEACHER's own resolved
// schedule, across every class they teach. v0.8 step 4 adds the
// absence-marking control. v0.8 step 5 adds the Agenda tab (today +
// upcoming, the default) alongside the original full-week grid — both
// reuse the SAME GET /me/teaching-timetable resolver, just with a
// different date range. Both ranges are fetched unconditionally (not
// gated by the active tab): "Mark absent" is available regardless of
// which tab is showing, and it offers dates from the agenda range
// (today + upcoming), which is the more natural fit for "mark yourself
// absent for today or one of the next few days" than the calendar week.
// Walk-found fix: NO GET /calendar/periods call — that route is
// SCHOOL_ADMIN/PROPRIETOR-only and stays that way; the week grid's period
// rows are derived from this response instead (deriveWeekPeriods).
export function TeacherTimetablePage() {
  const [tab, setTab] = useState("agenda");
  const weekRange = useMemo(() => getCurrentWeekRange(), []);
  const agendaRange = useMemo(() => getAgendaRange(), []);
  const weekTimetable = useTeachingTimetable(weekRange);
  const agendaTimetable = useTeachingTimetable(agendaRange);
  const [isAbsenceDialogOpen, setAbsenceDialogOpen] = useState(false);

  const active = tab === "week" ? weekTimetable : agendaTimetable;
  const isLoading = active.isLoading;
  const isError = active.isError;

  return (
    <div>
      <PageHeader
        title="My Timetable"
        description={tab === "week" ? "This week" : "Today & upcoming"}
        actions={
          agendaTimetable.data && (
            <Button type="button" onClick={() => setAbsenceDialogOpen(true)}>
              Mark absent
            </Button>
          )
        }
      />

      {agendaTimetable.data && (
        <AbsenceMarkingDialog open={isAbsenceDialogOpen} onClose={() => setAbsenceDialogOpen(false)} days={agendaTimetable.data.days} />
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
            <TimetableWeekView days={active.data.days} periods={deriveWeekPeriods(active.data.days)} showClass />
          ) : (
            <AgendaView days={active.data.days} showClass />
          )
        )}
      </Tabs>
    </div>
  );
}
