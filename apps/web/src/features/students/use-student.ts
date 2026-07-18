import { useQuery } from "@tanstack/react-query";
import type { StudentDetail } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ["students", "detail", id],
    queryFn: () => apiRequest<StudentDetail>(`/api/v1/students/${id}`),
    enabled: Boolean(id),
  });
}
