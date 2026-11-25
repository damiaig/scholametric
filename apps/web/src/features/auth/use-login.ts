import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LoginInput, LoginResponse } from "@scholametric/shared";
import { publicApiRequest } from "../../lib/api-client";
import { authStore } from "../../lib/auth-store";

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginInput) =>
      publicApiRequest<LoginResponse>("/api/v1/auth/login", { method: "POST", body: input }),
    onSuccess: (data) => {
      // v0.8.5 step 1 — the refresh token is never in this response body at
      // all now; it arrived as an httpOnly cookie the browser already
      // stored on its own (publicApiRequest -> rawFetch always sends
      // credentials:"include").
      //
      // v0.9 Item C (docs/SPEC_V0.9.md §3) — clear the query cache BEFORE
      // setTokens: setTokens() itself doesn't clear it (it's also used for
      // a silent mid-session refresh-rotation, where clearing would be
      // wasteful and wrong), but a login is always a genuinely NEW
      // identity, possibly a different user in the same tab a previous
      // session's authStore.clear() already emptied the cache for — this
      // is the "possibly didn't go through authStore.clear() first"
      // case (e.g. two logins back to back with no logout in between)
      // that needs its own explicit clear.
      queryClient.clear();
      authStore.setTokens({ accessToken: data.accessToken });
    },
  });
}
