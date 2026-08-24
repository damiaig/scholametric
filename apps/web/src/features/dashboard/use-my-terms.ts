import { useQuery } from "@tanstack/react-query";
import type { MyAcademicContext } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.6 step 3 (SPEC_V0.6.md §2.3) — GET /me/terms: the sessions/terms
// THIS student was ever enrolled in, so a term picker has something to
// read without broadening GET /sessions or /terms's admin-only RBAC.
export function useMyTerms() {
  return useQuery({
    queryKey: ["me", "terms"],
    queryFn: () => apiRequest<MyAcademicContext>("/api/v1/me/terms"),
  });
}
