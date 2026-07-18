import { useQuery } from "@tanstack/react-query";
import type { ClassLevelOverview } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

// GET /classes is TEACHER-readable (unlike GET /class-arms) and already
// carries each arm's current-session class teacher + level name in one
// request — the data source for the Classes page itself, the Teachers
// list's class-teacher badge, and every assignment dialog's arm picker.
export function useClasses() {
  return useQuery({
    queryKey: ["classes"],
    queryFn: () => apiRequest<ClassLevelOverview[]>("/api/v1/classes"),
  });
}
