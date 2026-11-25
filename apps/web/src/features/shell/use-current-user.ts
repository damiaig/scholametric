import { useQuery } from "@tanstack/react-query";
import type { CurrentUser } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import { useIsAuthenticated } from "../../lib/auth-store";

// v0.9 Item C (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — 5 minutes.
// Every path that changes the current user's own identity-relevant data
// (change-password, incl. the forced flow; school-profile edits, which
// are embedded in this response) already invalidates/removes this exact
// query key explicitly — this staleTime is what stops every OTHER newly-
// mounted useCurrentUser() observer (Sidebar, HelpPage, any page that
// reads it) from triggering its own redundant background refetch of data
// that hasn't changed. Session boundaries (logout, a definitive 401, a
// fresh login) go through authStore.clear()/the login mutation's own
// queryClient.clear() instead — a longer staleTime only works because the
// cache itself is wiped at those boundaries, never serving a PREVIOUS
// session's identity into a new one.
const STALE_TIME_MS = 5 * 60 * 1000;

export function useCurrentUser() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiRequest<CurrentUser>("/api/v1/auth/me"),
    enabled: isAuthenticated,
    staleTime: STALE_TIME_MS,
  });
}
