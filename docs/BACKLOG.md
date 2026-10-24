# ScholaMetric — Backlog

## Deferred / known issues

## School-local "today" for date rules (timezone correctness)
The backend computes "today" in UTC (CalendarService / the lesson isDateInTheFuture check and
homework's minDate=today). Schools are WAT (UTC+1, no DST), so for the first hour after local
midnight, server-UTC "today" lags school-local "today" by a day: a teacher logging today's
lesson at ~00:30 WAT sends the local date, the backend reads it as the future and 400s it —
a spurious nightly-window rejection. Homework's minDate=today touches the same convention from
the other side. Fix = timezone-aware (school-local) date resolution for the date rules, applied
to both lessons and homework. Not scheduled to a version yet. Surfaced only because a v0.8.4
Step 3 PROVE ran locally in Paris-evening (23:45 UTC); CI runs in UTC and never catches it.
