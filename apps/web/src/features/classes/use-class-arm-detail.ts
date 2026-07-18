import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ClassArmDetail } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export function useClassArmDetail(armId: string | undefined, page: number, pageSize = 20) {
  return useQuery({
    queryKey: ["class-arm", armId, { page, pageSize }],
    queryFn: () => apiRequest<ClassArmDetail>(`/api/v1/class-arms/${armId}`, { query: { page, pageSize } }),
    enabled: Boolean(armId),
    placeholderData: keepPreviousData,
  });
}
