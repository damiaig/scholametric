import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BatchReissueResult, Paginated, PortalAccountSummary, ProvisionResult, ReissuedPortalAccount } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

export interface PortalAccountsListParams {
  page: number;
  pageSize: number;
}

export function usePortalAccounts(params: PortalAccountsListParams) {
  return useQuery({
    queryKey: ["portal-accounts", params],
    queryFn: () =>
      apiRequest<Paginated<PortalAccountSummary>>("/api/v1/portal-accounts", {
        query: { page: params.page, pageSize: params.pageSize },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useProvisionPortalAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<ProvisionResult>("/api/v1/portal-accounts/provision", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal-accounts"] }),
  });
}

export function useReissuePortalAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<ReissuedPortalAccount>(`/api/v1/portal-accounts/${id}/reissue`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal-accounts"] }),
  });
}

export function useReissueForClassArm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classArmId, force }: { classArmId: string; force?: boolean }) =>
      apiRequest<BatchReissueResult>(`/api/v1/portal-accounts/class-arms/${classArmId}/reissue`, {
        method: "POST",
        body: { force },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal-accounts"] }),
  });
}
