import { useQuery } from "@tanstack/react-query";
import type { MyTeaching } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useMyTeaching() {
  return useQuery({
    queryKey: ["me", "teaching"],
    queryFn: () => apiRequest<MyTeaching>("/api/v1/me/teaching"),
  });
}
