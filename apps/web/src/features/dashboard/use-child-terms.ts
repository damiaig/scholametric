import { useQuery } from "@tanstack/react-query";
import type { MyAcademicContext } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.6 step 4 (SPEC_V0.6.md §2.4) — GET /me/children/:childId/terms: the
// sessions/terms a SPECIFIC linked child was ever enrolled in. childId is
// validated server-side against the parent's own children before this
// ever runs (assertChildBelongsToCaller) — a 404 here means "not yours,"
// same as any other child route.
export function useChildTerms(childId: string | null) {
  return useQuery({
    queryKey: ["me", "children", childId, "terms"],
    queryFn: () => apiRequest<MyAcademicContext>(`/api/v1/me/children/${childId}/terms`),
    enabled: childId !== null,
  });
}
