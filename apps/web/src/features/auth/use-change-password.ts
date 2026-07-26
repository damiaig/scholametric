import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ChangePasswordInput, RefreshResponse } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import { authStore } from "../../lib/auth-store";

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiRequest<RefreshResponse>("/api/v1/auth/change-password", { method: "POST", body: input }),
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
