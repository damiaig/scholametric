import { useQuery } from "@tanstack/react-query";
import type { CurrentUser } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";
import { useIsAuthenticated } from "../../lib/auth-store";

export function useCurrentUser() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiRequest<CurrentUser>("/api/v1/auth/me"),
    enabled: isAuthenticated,
  });
}
