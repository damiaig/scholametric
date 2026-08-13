import { useQuery } from "@tanstack/react-query";
import type { ClassArmResultsResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface ClassArmResultsParams {
  classArmId: string;
  termId: string;
}

export function classArmResultsQueryKey(params: ClassArmResultsParams) {
  return ["grades", "class-arm-results", params.classArmId, params.termId] as const;
}

export function useClassArmResults(params: ClassArmResultsParams | null) {
  return useQuery({
    queryKey: params ? classArmResultsQueryKey(params) : ["grades", "class-arm-results", "disabled"],
    queryFn: () =>
      apiRequest<ClassArmResultsResponse>(`/api/v1/class-arms/${params?.classArmId}/results`, {
        query: params ? { termId: params.termId } : undefined,
      }),
    enabled: params !== null,
  });
}
