import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api-client";
import { authStore } from "../../lib/auth-store";

// No explicit navigate() here — clearing the auth store makes
// ProtectedLayout's reactive guard redirect to /login on its next render.
export function useLogout() {
  const queryClient = useQueryClient();

  return async function logout(): Promise<void> {
    const tokens = authStore.getState();
    try {
      if (tokens) {
        await apiRequest("/api/v1/auth/logout", { method: "POST", body: { refreshToken: tokens.refreshToken } });
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
