import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { usePeriods } from "../settings/use-periods";
import { useMyChildren } from "../dashboard/use-my-children";
import { useMyTimetable, useChildTimetable } from "./use-timetable-views";
import { getCurrentWeekRange } from "./current-week-range";
import { TimetableWeekView } from "./TimetableWeekView";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-64";

// v0.8 step 3 (SPEC_V0.8.md §7 item 3) — the STUDENT's own class's
// resolved weekly schedule. No classArmId param anywhere — self, resolved
// server-side from the token.
function MyTimetable() {
  const { from, to } = useMemo(() => getCurrentWeekRange(), []);
  const periods = usePeriods();
  const timetable = useMyTimetable({ from, to });

  const isLoading = periods.isLoading || timetable.isLoading;
  const isError = periods.isError || timetable.isError;

  return (
    <div>
      <PageHeader title="Timetable" description={timetable.data?.className ?? "This week"} />

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

      {!isLoading && !isError && periods.data && timetable.data && <TimetableWeekView days={timetable.data.days} periods={periods.data} />}
    </div>
  );
}

// v0.8 step 3 — the PARENT analogue, per linked child, via the SAME
// child-switcher pattern MyGradesPage's own ChildGrades already uses
// (?childId= in the query string, defaulting to the first linked child).
function ChildTimetable() {
  const children = useMyChildren();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedChildId = searchParams.get("childId") ?? "";
  const validChildId =
    requestedChildId && children.data?.children.some((child) => child.studentId === requestedChildId) ? requestedChildId : "";
  const childId = validChildId || (children.data?.children[0]?.studentId ?? "");

  useEffect(() => {
    if (!children.data || requestedChildId === childId || !childId) return;
    const next = new URLSearchParams(searchParams);
    next.set("childId", childId);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.data, childId]);

  const selectedChild = children.data?.children.find((child) => child.studentId === childId) ?? null;
  const { from, to } = useMemo(() => getCurrentWeekRange(), []);
  const periods = usePeriods();
  const timetable = useChildTimetable(childId ? { childId, from, to } : null);

  function handleChildChange(nextChildId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("childId", nextChildId);
    setSearchParams(next, { replace: true });
  }

  const isLoading = periods.isLoading || timetable.isLoading;
  const isError = periods.isError || timetable.isError;
  const headerDescription = timetable.data?.className ?? selectedChild?.currentClassArmLabel ?? "This week";

  return (
    <div>
      <PageHeader title="Timetable" description={headerDescription} />

      {!children.isLoading && (children.data?.children.length ?? 0) === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">No children linked to your account yet.</p>
          </CardContent>
        </Card>
      )}

      {(children.data?.children.length ?? 0) > 0 && (
        <div className="mb-4 flex flex-col gap-1.5">
          <Label htmlFor="timetable-child">Child</Label>
          <select
            id="timetable-child"
            className={SELECT_CLASS}
            value={childId}
            onChange={(event) => handleChildChange(event.target.value)}
            disabled={children.isLoading}
          >
            <option value="" disabled>
              Select…
            </option>
            {children.data?.children.map((child) => (
              <option key={child.studentId} value={child.studentId}>
                {child.firstName} {child.lastName}
                {child.currentClassArmLabel ? ` — ${child.currentClassArmLabel}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {childId && isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading timetable…
        </p>
      )}

      {childId && isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">
              {getErrorMessage(timetable.error ?? periods.error, "Couldn't load this timetable.")}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => timetable.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {childId && !isLoading && !isError && periods.data && timetable.data && (
        <TimetableWeekView days={timetable.data.days} periods={periods.data} />
      )}
    </div>
  );
}

export function MyTimetablePage() {
  const { data: user } = useCurrentUser();
  if (user?.role === "STUDENT") {
    return <MyTimetable />;
  }
  return <ChildTimetable />;
}
