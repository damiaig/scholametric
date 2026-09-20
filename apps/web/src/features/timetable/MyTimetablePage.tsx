import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { Tabs } from "../../components/ui/tabs";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyChildren } from "../dashboard/use-my-children";
import { useMyTimetable, useChildTimetable } from "./use-timetable-views";
import { getCurrentWeekRange, getAgendaRange } from "./current-week-range";
import { TimetableWeekView } from "./TimetableWeekView";
import { AgendaView } from "./AgendaView";
import { deriveWeekPeriods } from "./derive-week-periods";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-64";

const VIEW_TABS = [
  { value: "agenda", label: "Agenda" },
  { value: "week", label: "Full week" },
];

// v0.8 step 3 (SPEC_V0.8.md §7 item 3) — the STUDENT's own class's
// resolved schedule. No classArmId param anywhere — self, resolved
// server-side from the token. v0.8 step 5 adds the Agenda tab (today +
// upcoming, the default) alongside the original full-week grid — both
// reuse the same GET /me/timetable resolver, just a different range.
// Walk-found fix: NO GET /calendar/periods call here — that route is
// SCHOOL_ADMIN/PROPRIETOR-only and stays that way; the week grid's period
// rows are derived from this response instead (deriveWeekPeriods).
function MyTimetable() {
  const [tab, setTab] = useState("agenda");
  const weekRange = useMemo(() => getCurrentWeekRange(), []);
  const agendaRange = useMemo(() => getAgendaRange(), []);
  const weekTimetable = useMyTimetable(weekRange);
  const agendaTimetable = useMyTimetable(agendaRange);
  const active = tab === "week" ? weekTimetable : agendaTimetable;

  const isLoading = active.isLoading;
  const isError = active.isError;

  return (
    <div>
      <PageHeader title="Timetable" description={active.data?.className ?? (tab === "week" ? "This week" : "Today & upcoming")} />

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
            <TimetableWeekView days={active.data.days} periods={deriveWeekPeriods(active.data.days)} />
          ) : (
            <AgendaView days={active.data.days} />
          )
        )}
      </Tabs>
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
  const [tab, setTab] = useState("agenda");
  const weekRange = useMemo(() => getCurrentWeekRange(), []);
  const agendaRange = useMemo(() => getAgendaRange(), []);
  const weekTimetable = useChildTimetable(childId ? { childId, ...weekRange } : null);
  const agendaTimetable = useChildTimetable(childId ? { childId, ...agendaRange } : null);
  const timetable = tab === "week" ? weekTimetable : agendaTimetable;

  function handleChildChange(nextChildId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("childId", nextChildId);
    setSearchParams(next, { replace: true });
  }

  const isLoading = timetable.isLoading;
  const isError = timetable.isError;
  const headerDescription = timetable.data?.className ?? selectedChild?.currentClassArmLabel ?? (tab === "week" ? "This week" : "Today & upcoming");

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

      {childId && (
        <Tabs value={tab} onValueChange={setTab} items={VIEW_TABS} aria-label="Timetable view">
          {isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Loading timetable…
            </p>
          )}

          {isError && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                <p className="text-sm text-danger">{getErrorMessage(timetable.error, "Couldn't load this timetable.")}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => timetable.refetch()}>
                  Try again
                </Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && !isError && timetable.data && (
            tab === "week" ? (
              <TimetableWeekView days={timetable.data.days} periods={deriveWeekPeriods(timetable.data.days)} />
            ) : (
              <AgendaView days={timetable.data.days} />
            )
          )}
        </Tabs>
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
