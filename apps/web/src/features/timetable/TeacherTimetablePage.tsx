import { useMemo } from "react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { usePeriods } from "../settings/use-periods";
import { useTeachingTimetable } from "./use-timetable-views";
import { getCurrentWeekRange } from "./current-week-range";
import { TimetableWeekView } from "./TimetableWeekView";

// v0.8 step 3 (SPEC_V0.8.md §7 item 3) — a TEACHER's own resolved weekly
// schedule, across every class they teach. This week only, for now — a
// week-by-week navigator is a reasonable Step 5 (live agenda) extension,
// not required by this step.
export function TeacherTimetablePage() {
  const { from, to } = useMemo(() => getCurrentWeekRange(), []);
  const periods = usePeriods();
  const timetable = useTeachingTimetable({ from, to });

  const isLoading = periods.isLoading || timetable.isLoading;
  const isError = periods.isError || timetable.isError;

  return (
    <div>
      <PageHeader title="My Timetable" description="This week" />

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading your timetable…
        </p>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">
              {getErrorMessage(timetable.error ?? periods.error, "Couldn't load your timetable.")}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => timetable.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && periods.data && timetable.data && (
        <TimetableWeekView days={timetable.data.days} periods={periods.data} showClass />
      )}
    </div>
  );
}
