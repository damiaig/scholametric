import { useMemo } from "react";
import { useSessions } from "../settings/use-sessions";
import { useTerms } from "../settings/use-terms";

// SCHOOL_ADMIN/PROPRIETOR only — GET /sessions and GET /terms both 403
// for TEACHER, who instead reads currentSessionId/currentTermId straight
// off GET /me/teaching (see EnterScoresTab). Admin gets a real term
// dropdown (not just "current"), since an admin may legitimately need to
// enter/correct a non-current term's scores.
//
// `enabled` must be passed false for a TEACHER caller — this hook is
// always CALLED (React hooks can't be conditional), but must never
// actually FIRE the underlying admin-only requests for a role that would
// just get 403s back.
export function useAdminCurrentTerm(enabled = true) {
  const sessions = useSessions(1, 50, enabled);
  const currentSession = useMemo(() => sessions.data?.items.find((s) => s.isCurrent), [sessions.data]);
  const terms = useTerms(currentSession?.id, 1, 20, enabled);
  const currentTerm = useMemo(() => terms.data?.items.find((t) => t.isCurrent), [terms.data]);

  return {
    isLoading: sessions.isLoading || terms.isLoading,
    sessions: sessions.data?.items ?? [],
    currentSessionId: currentSession?.id ?? null,
    terms: terms.data?.items ?? [],
    currentTermId: currentTerm?.id ?? null,
  };
}
