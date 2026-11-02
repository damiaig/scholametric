import { useEffect, type ReactNode } from "react";
import { Spinner } from "../components/ui/spinner";
import { authStore, useAuthStatus } from "../lib/auth-store";
import { refreshTokens } from "../lib/api-client";

/**
 * v0.8.5 step 3 (SPEC_V0.8.5.md §3) — the reload fix. Wraps the entire
 * route tree (see App.tsx) so NOTHING protected and NOT /login renders
 * while status is "unknown": AppRoutes itself isn't instantiated yet, so
 * LoginRoute/ChangePasswordRoute/ProtectedLayout never get a chance to
 * render the wrong thing before the boot refresh settles — this is what
 * makes a reload with a valid cookie go splash -> app with no flash of the
 * login screen, rather than something each of those three had to be
 * individually taught to avoid.
 *
 * The boot refresh is fire-and-forget from this effect's point of view:
 * success moves status to "authenticated" (access token now in memory),
 * failure (no cookie, expired, revoked) moves it to "unauthenticated" —
 * both handled here, so neither path throws or logs anything upward.
 */
export function AuthBootGate({ children }: { children: ReactNode }) {
  const status = useAuthStatus();

  useEffect(() => {
    refreshTokens()
      .then((tokens) => authStore.setTokens(tokens))
      .catch(() => authStore.clear());
  }, []);

  if (status === "unknown") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return <>{children}</>;
}
