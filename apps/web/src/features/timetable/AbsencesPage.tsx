import { useMemo, useState } from "react";
import { CalendarOff } from "lucide-react";
import { isPeriodTimePast } from "@scholametric/shared";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { formatDate } from "../../lib/format-date";
import { getCurrentWeekRange } from "./current-week-range";
import { useTeacherAbsences } from "./use-teacher-absences";
import { ReplacementFormDialog } from "./ReplacementFormDialog";

interface ReplacementTarget {
  exceptionId: string;
  periodLabel: string;
  isReplaced: boolean;
}

// v0.8 step 4 (SPEC_V0.8.md §4) — the proprietor/admin's view of every
// teacher absence this week, with a Replace action per affected period.
// This week only, same scope as TeacherTimetablePage's own week view —
// no separate date navigator required by this step.
// v0.8.1 step 3 (SPEC_V0.8.1.md §2.8) — can't cover a class that's
// already happened: once isPeriodTimePast (shared with the backend's own
// guard on the same endpoint) says a period is over, its action button is
// replaced with "Passed" — applies to setting, editing, AND reverting a
// replacement alike, not just the not-yet-replaced case.
export function AbsencesPage() {
  const { from, to } = useMemo(() => getCurrentWeekRange(), []);
  const absences = useTeacherAbsences({ from, to });
  const [target, setTarget] = useState<ReplacementTarget | null>(null);

  return (
    <div>
      <PageHeader title="Teacher Absences" description="This week" />

      {absences.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading absences…
        </p>
      )}

      {absences.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">{getErrorMessage(absences.error, "Couldn't load absences.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => absences.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {absences.data && absences.data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <CalendarOff className="h-8 w-8 text-muted" aria-hidden="true" />
            <p className="text-sm text-muted">No teacher absences recorded this week.</p>
          </CardContent>
        </Card>
      )}

      {absences.data && absences.data.length > 0 && (
        <div className="flex flex-col gap-4">
          {absences.data.map((absence) => (
            <Card key={absence.id}>
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold text-text">{absence.teacherName}</p>
                  <p className="text-sm text-muted">{formatDate(absence.date)}</p>
                </div>
                <p className="text-sm text-muted">&ldquo;{absence.note}&rdquo;</p>

                <div className="flex flex-col gap-2">
                  {absence.periods.map((period) => {
                    const isPast = isPeriodTimePast(absence.date, period.endsAt);
                    return (
                      <div key={period.periodId} className="flex items-center justify-between gap-3 rounded-md border border-muted/20 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text">
                            {period.periodName} · {period.className}
                          </p>
                          <p className={period.status === "REPLACED" ? "text-xs text-warning" : "text-xs text-danger"}>
                            {period.status === "REPLACED" ? "Replaced" : "Cancelled"}
                          </p>
                        </div>
                        {isPast ? (
                          <span className="text-xs text-muted">Passed</span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setTarget({
                                exceptionId: period.exceptionId,
                                periodLabel: `${period.periodName} · ${period.className} · ${formatDate(absence.date)}`,
                                isReplaced: period.status === "REPLACED",
                              })
                            }
                          >
                            {period.status === "REPLACED" ? "Edit replacement" : "Replace"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {target && (
        <ReplacementFormDialog
          open
          onClose={() => setTarget(null)}
          exceptionId={target.exceptionId}
          periodLabel={target.periodLabel}
          isReplaced={target.isReplaced}
        />
      )}
    </div>
  );
}
