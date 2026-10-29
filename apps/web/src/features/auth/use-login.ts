import { useMutation } from "@tanstack/react-query";
import type { LoginInput, LoginResponse } from "@scholametric/shared";
import { publicApiRequest } from "../../lib/api-client";
import { authStore } from "../../lib/auth-store";

export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginInput) =>
      publicApiRequest<LoginResponse>("/api/v1/auth/login", { method: "POST", body: input }),
    onSuccess: (data) => {
      // v0.8.5 step 1 — the refresh token is never in this response body at
      // all now; it arrived as an httpOnly cookie the browser already
      // stored on its own (publicApiRequest -> rawFetch always sends
      // credentials:"include").
      authStore.setTokens({ accessToken: data.accessToken });
    },
  });
}
