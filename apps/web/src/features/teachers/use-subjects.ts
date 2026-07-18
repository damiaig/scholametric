import { useQuery } from "@tanstack/react-query";
import type { Paginated, Subject } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

const MAX_SUBJECTS = 100;

export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: () => apiRequest<Paginated<Subject>>("/api/v1/subjects", { query: { pageSize: MAX_SUBJECTS } }),
    select: (data) => data.items,
  });
}
