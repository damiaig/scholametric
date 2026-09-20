import type { ResolvedTimetableDay } from "@scholametric/shared";
import { AgendaDayCard } from "./AgendaDayCard";

interface AgendaViewProps {
  /** Today + upcoming days, in date order — the first entry is "today." */
  days: ResolvedTimetableDay[];
  showClass?: boolean;
}

// v0.8 step 5 (SPEC_V0.8.md §7 item 5) — the Pronote-style "for today /
// upcoming days" agenda. Purely presentational: the caller fetches
// {from: today, to: today+6} via the SAME resolved-schedule hooks the
// week grid already uses (getAgendaRange), owning its own loading/error
// states exactly like the week view does — this component just groups
// and renders what it's given. No day is ever collapsed or skipped, even
// a non-school one (AgendaDayCard's own holiday/weekend state handles it).
export function AgendaView({ days, showClass = false }: AgendaViewProps) {
  if (days.length === 0) {
    return <p className="text-sm text-muted">Nothing scheduled.</p>;
  }

  const [today, ...upcoming] = days;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Today</h2>
        <AgendaDayCard day={today} showClass={showClass} />
      </section>

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Upcoming</h2>
          <div className="flex flex-col gap-3">
            {upcoming.map((day) => (
              <AgendaDayCard key={day.date} day={day} showClass={showClass} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
