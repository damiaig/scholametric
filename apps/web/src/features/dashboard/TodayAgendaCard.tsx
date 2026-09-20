import { Link } from "react-router-dom";
import type { ResolvedTimetableDay } from "@scholametric/shared";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { AgendaDayCard } from "../timetable/AgendaDayCard";

interface TodayAgendaCardProps {
  data: { days: ResolvedTimetableDay[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  linkHref: string;
  showClass?: boolean;
}

// v0.8 step 5 (SPEC_V0.8.md §7 item 5) — the home-dashboard "for today"
// strip (deferred from Step 3). Purely presentational, same shape as
// AgendaView: the caller (each dashboard) owns its own single-day query
// via the SAME hooks the full agenda/week views already use
// (getAgendaRange(new Date(), 1)) and passes the TanStack Query result
// straight through — no new resolution, no new endpoint.
export function TodayAgendaCard({ data, isLoading, isError, error, onRetry, linkHref, showClass = false }: TodayAgendaCardProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Today's schedule</h2>
        <Link to={linkHref} className="text-xs font-medium text-primary hover:underline">
          Full agenda →
        </Link>
      </div>

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading…
        </p>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-start gap-2 p-4">
            <p className="text-sm text-danger">{getErrorMessage(error, "Couldn't load today's schedule.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data?.days?.[0] && <AgendaDayCard day={data.days[0]} compact showClass={showClass} />}
    </div>
  );
}
