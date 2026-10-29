import { useQueryClient } from "@tanstack/react-query";
import { apiRequest, CSRF_HEADER } from "../../lib/api-client";
import { authStore } from "../../lib/auth-store";

// No explicit navigate() here — clearing the auth store makes
// ProtectedLayout's reactive guard redirect to /login on its next render.
export function useLogout() {
  const queryClient = useQueryClient();

  return async function logout(): Promise<void> {
    const tokens = authStore.getState();
    try {
      if (tokens) {
        // v0.8.5 step 1 — no body at all: the backend reads the refresh
        // token straight off the cookie (credentials:"include", already
        // on every rawFetch call) and the CSRF header is required on this
        // endpoint now (CsrfHeaderGuard).
        await apiRequest("/api/v1/auth/logout", { method: "POST", headers: CSRF_HEADER });
      }
    } catch {
      // The user's intent is to log out locally regardless of whether
      // server-side revocation succeeded.
    } finally {
      authStore.clear();
      queryClient.clear();
    }
  };
}
