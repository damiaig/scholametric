import { useQuery } from "@tanstack/react-query";
import type { ClassArm, Paginated } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

const MAX_CLASS_ARMS = 100;

// GET /class-arms is SCHOOL_ADMIN-only server-side, so this 403s for
// TEACHER — callers that render UI from this (e.g. the students list's
// class-arm filter) should treat isError as "hide this control", not show
// a broken/empty dropdown. See docs/DECISIONS.md.
export function useClassArms() {
  return useQuery({
    queryKey: ["class-arms"],
    queryFn: () => apiRequest<Paginated<ClassArm>>("/api/v1/class-arms", { query: { pageSize: MAX_CLASS_ARMS } }),
    select: (data) => data.items,
    retry: false,
  });
}
