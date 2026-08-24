import { useQuery } from "@tanstack/react-query";
import type { MyChildrenResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.6 step 4 (SPEC_V0.6.md §2.4) — GET /me/children: the child-switcher's
// data, self-scoped from the parent's own guardianId (no param).
export function useMyChildren() {
  return useQuery({
    queryKey: ["me", "children"],
    queryFn: () => apiRequest<MyChildrenResponse>("/api/v1/me/children"),
  });
}
