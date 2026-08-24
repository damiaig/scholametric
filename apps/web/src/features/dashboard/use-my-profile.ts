import { useQuery } from "@tanstack/react-query";
import type { MyProfile } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// v0.6 step 3 (SPEC_V0.6.md §2.3) — GET /me/profile: a STUDENT's own
// basic profile, self-resolved server-side (no id param).
export function useMyProfile() {
  return useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => apiRequest<MyProfile>("/api/v1/me/profile"),
  });
}
