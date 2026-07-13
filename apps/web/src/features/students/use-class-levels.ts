import { useQuery } from "@tanstack/react-query";
import type { ClassLevel, Paginated } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

const MAX_CLASS_LEVELS = 100;

export function useClassLevels() {
  return useQuery({
    queryKey: ["class-levels"],
    queryFn: () =>
      apiRequest<Paginated<ClassLevel>>("/api/v1/class-levels", { query: { pageSize: MAX_CLASS_LEVELS } }),
    select: (data) => data.items,
  });
}
