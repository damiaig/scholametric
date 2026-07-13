import { useQuery } from "@tanstack/react-query";
import type { Paginated, Student } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import { useDebouncedValue } from "../../lib/use-debounced-value";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 8;

export function useGlobalStudentSearch(query: string) {
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const enabled = debounced.length >= MIN_QUERY_LENGTH;

  const result = useQuery({
    queryKey: ["global-search", "students", debounced],
    queryFn: () =>
      apiRequest<Paginated<Student>>("/api/v1/students", {
        query: { search: debounced, page: 1, pageSize: RESULT_LIMIT },
      }),
    enabled,
    select: (data) => data.items,
  });

  return { ...result, enabled };
}
