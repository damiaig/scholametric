import { useQuery } from "@tanstack/react-query";
import type { SchoolSearchResult } from "@scholametric/shared";
import { publicApiRequest } from "../../lib/api-client";
import { useDebouncedValue } from "../../lib/use-debounced-value";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export function useSchoolSearch(query: string) {
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const enabled = debounced.length >= MIN_QUERY_LENGTH;

  const result = useQuery({
    queryKey: ["schools", "search", debounced],
    queryFn: () => publicApiRequest<SchoolSearchResult[]>("/api/v1/schools/search", { query: { q: debounced } }),
    enabled,
  });

  return { ...result, enabled };
}
