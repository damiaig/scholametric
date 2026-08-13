import { useQuery } from "@tanstack/react-query";
import type { GradesGridResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface GradesGridParams {
  classArmId: string;
  subjectId: string;
  componentId: string;
  termId: string;
}

export function gradesGridQueryKey(params: GradesGridParams) {
  return ["grades", "grid", params.classArmId, params.subjectId, params.componentId, params.termId] as const;
}

// A successful PUT /grades/grid patches this query's cache directly
// (see use-score-entry-save-queue.ts) rather than invalidating — an
// invalidate-triggered refetch mid-typing-session would visibly reload
// the grid under the teacher's hands. This hook is the read path only;
// callers needing a real refresh (e.g. to pick up someone else's
// concurrent edit) call `refetch()` explicitly.
export function useGradesGrid(params: GradesGridParams | null) {
  return useQuery({
    queryKey: params ? gradesGridQueryKey(params) : ["grades", "grid", "disabled"],
    queryFn: () =>
      apiRequest<GradesGridResponse>("/api/v1/grades/grid", {
        query: params
          ? {
              classArmId: params.classArmId,
              subjectId: params.subjectId,
              componentId: params.componentId,
              termId: params.termId,
            }
          : undefined,
      }),
    enabled: params !== null,
  });
}
