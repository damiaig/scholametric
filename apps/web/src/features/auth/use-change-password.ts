import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ChangePasswordInput, RefreshResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import { authStore } from "../../lib/auth-store";

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      // skipAuthRetry: a 401 here means "current password is wrong," never
      // "access token expired" — without this, apiRequest's generic retry
      // would refresh, retry (401 again for the same reason), and then
      // clear the caller's perfectly valid session (docs/DECISIONS.md).
      apiRequest<RefreshResponse>("/api/v1/auth/change-password", { method: "POST", body: input, skipAuthRetry: true }),
    onSuccess: (tokens) => {
      // The caller's OWN pre-existing access token still carries the stale
      // mustChangePassword:true claim — without swapping to the reissued
      // pair immediately, the guard would keep blocking this same client
      // until that token naturally expired (docs/API.md).
      authStore.setTokens(tokens);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
