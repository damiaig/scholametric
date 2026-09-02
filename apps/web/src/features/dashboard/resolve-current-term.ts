import type { MyAcademicContext } from "@scholametric/shared";

export interface CurrentTerm {
  termId: string;
  sessionId: string;
}

// Same "current, else most-recently-enrolled" fallback MyGradesPage's own
// term picker already applies inline — extracted here since the new
// dashboards need it purely to pick a default, with no picker UI of
// their own.
export function resolveCurrentTerm(context: MyAcademicContext | undefined): CurrentTerm | null {
  const options = (context?.sessions ?? []).flatMap((session) => session.terms.map((term) => ({ termId: term.id, sessionId: session.id, isCurrent: term.isCurrent })));
  if (options.length === 0) return null;
  const current = options.find((option) => option.isCurrent) ?? options[options.length - 1];
  return { termId: current.termId, sessionId: current.sessionId };
}
