import { useQuery } from "@tanstack/react-query";
import type { Student } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ["students", "detail", id],
    queryFn: () => apiRequest<Student>(`/api/v1/students/${id}`),
    enabled: Boolean(id),
  });
}
