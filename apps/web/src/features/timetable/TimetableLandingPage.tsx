import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { useClasses } from "../classes/use-classes";

// v0.8 step 2 (SPEC_V0.8.md §7 item 2) — SCHOOL_ADMIN/PROPRIETOR-only for
// now (no TEACHER path until a later v0.8 step), gated by RequireSchoolAdmin
// at the route. Reuses useClasses() — the SAME hook GradesLandingPage's own
// AdminGradesView calls — no new query, same school-wide class browser
// shape, just linking to /timetable/arms/:id instead of /grades/arms/:id.
export function TimetableLandingPage() {
  const { data: user } = useCurrentUser();
  const classes = useClasses();

  return (
    <div>
      <PageHeader title="Timetable" description={user?.school.name} />

      {classes.isLoading && <PickerSkeleton />}

      {classes.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">{getErrorMessage(classes.error, "Couldn't load classes.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => classes.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {classes.data && !classes.data.some((level) => level.arms.length > 0) && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <CalendarClock className="h-8 w-8 text-muted" aria-hidden="true" />
            <p className="text-sm text-muted">No classes have been set up yet — add one from the Classes page.</p>
          </CardContent>
        </Card>
      )}

      {classes.data && classes.data.some((level) => level.arms.length > 0) && (
        <div className="flex flex-col gap-6">
          {classes.data
            .filter((level) => level.arms.length > 0)
            .map((level) => (
              <section key={level.id}>
                <h2 className="mb-2 text-lg font-semibold text-text">{level.name}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {level.arms.map((arm) => (
                    <Link key={arm.id} to={`/timetable/arms/${arm.id}`} className="block">
                      <Card className="transition-colors hover:border-primary/40">
                        <CardContent className="flex items-center gap-4 p-6">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <CalendarClock className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <p className="truncate font-semibold text-text">
                            {level.name} {arm.name}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

function PickerSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading classes">
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-20 animate-pulse rounded-lg border border-muted/20 bg-card" />
      ))}
    </div>
  );
}
