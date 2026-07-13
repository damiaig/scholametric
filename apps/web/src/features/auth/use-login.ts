import { useMutation } from "@tanstack/react-query";
import type { LoginInput, LoginResponse } from "@scholametric/shared";
import { publicApiRequest } from "../../lib/api-client";
import { authStore } from "../../lib/auth-store";

export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginInput) =>
      publicApiRequest<LoginResponse>("/api/v1/auth/login", { method: "POST", body: input }),
    onSuccess: (data) => {
      authStore.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    },
  });
}
