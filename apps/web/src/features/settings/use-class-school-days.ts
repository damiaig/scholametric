import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClassSchoolDays, SetClassSchoolDaysInput } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useClassSchoolDays() {
  return useQuery({
    queryKey: ["calendar", "class-school-days"],
    queryFn: () => apiRequest<ClassSchoolDays[]>("/api/v1/calendar/class-school-days"),
  });
}

export function useSetClassSchoolDays() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classArmId, input }: { classArmId: string; input: SetClassSchoolDaysInput }) =>
      apiRequest<ClassSchoolDays>(`/api/v1/calendar/class-school-days/${classArmId}`, { method: "PUT", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar", "class-school-days"] }),
  });
}
