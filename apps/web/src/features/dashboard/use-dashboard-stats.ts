import { useQuery } from "@tanstack/react-query";
import type { DashboardStats } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => apiRequest<DashboardStats>("/api/v1/dashboard/stats"),
  });
}
